<?php
if (!defined('ABSPATH')) exit;

/**
 * Buy More Save More (BMSM)
 * - Parent aggregate (group by parent product_id)
 * - Apply via set_price in woocommerce_before_calculate_totals (Method A)
 * - Exclusive with FBT combo discount: if product is covered by combo, skip BMSM for that product
 */

const BMSM_META_ENABLED = '_bmsm_enabled';
const BMSM_META_RULES   = '_bmsm_rules';

/** Reuse your FBT meta keys (must match your combo snippet) */
const FBT_META_ENABLED  = '_fbt_enabled';
const FBT_META_IDS      = '_fbt_combo_ids';
const FBT_META_RULES    = '_fbt_discount_rules';

// -------------------------------
// Helpers
// -------------------------------
function bmsm_sanitize_rules($rules) {
  // rules: [{min:2, rate:0.05}, ...]
  if (is_string($rules)) {
    $decoded = json_decode($rules, true);
    $rules = is_array($decoded) ? $decoded : [];
  }
  if (!is_array($rules)) return [];

  $out = [];
  foreach ($rules as $r) {
    if (!is_array($r)) continue;
    $min  = isset($r['min']) ? intval($r['min']) : 0;
    $rate = isset($r['rate']) ? floatval($r['rate']) : 0.0;

    if ($min < 2) continue;
    if ($rate <= 0) continue;
    if ($rate > 0.95) $rate = 0.95;

    $out[] = ['min' => $min, 'rate' => $rate];
  }

  usort($out, fn($a,$b) => $a['min'] <=> $b['min']);
  return $out;
}

function bmsm_pick_rate(array $rules, int $qty) {
  $rate = 0.0;
  foreach ($rules as $r) {
    if ($qty >= intval($r['min'])) $rate = floatval($r['rate']);
  }
  return $rate;
}

function bmsm_build_qty_by_parent(WC_Cart $cart) {
  $qty = [];
  foreach ($cart->get_cart() as $item) {
    $pid = intval($item['product_id']); // parent id
    $q   = intval($item['quantity']);
    if ($pid <= 0 || $q <= 0) continue;
    $qty[$pid] = ($qty[$pid] ?? 0) + $q;
  }
  return $qty;
}

/**
 * Predict which products are "covered" by FBT discount (exclusive guard).
 * This mirrors your FBT fee logic at the eligibility level.
 */
function bmsm_get_fbt_covered_products(WC_Cart $cart) {
  $qty = bmsm_build_qty_by_parent($cart);
  if (empty($qty)) return [];

  $covered = [];
  $used    = []; // mimic your simple guard to avoid stacking

  foreach (array_keys($qty) as $main_id) {
    $enabled = get_post_meta($main_id, FBT_META_ENABLED, true);
    if ($enabled !== '1') continue;

    $combo_ids = get_post_meta($main_id, FBT_META_IDS, true);
    if (!is_array($combo_ids)) $combo_ids = [];
    $combo_ids = array_values(array_unique(array_filter(array_map('intval', $combo_ids))));
    if (!$combo_ids) continue;

    $rules_json = get_post_meta($main_id, FBT_META_RULES, true);
    $rules = bmsm_sanitize_rules($rules_json);
    if (empty($rules)) continue;

    // present combo products in cart
    $present = [];
    foreach ($combo_ids as $pid) {
      if (!empty($qty[$pid])) $present[] = $pid;
    }

    // include main itself
    $eligible_products = array_values(array_unique(array_merge([$main_id], $present)));

    // remove already-used (match your anti-stacking)
    $eligible_products = array_values(array_diff($eligible_products, $used));

    $count = count($eligible_products);
    if ($count < 2) continue;

    $rate = bmsm_pick_rate($rules, $count);
    if ($rate <= 0) continue;

    // mark as covered + used
    $covered = array_values(array_unique(array_merge($covered, $eligible_products)));
    $used    = array_values(array_unique(array_merge($used, $eligible_products)));
  }

  return $covered;
}

function bmsm_restore_original_price(array &$cart_item) {
  if (isset($cart_item['_bmsm_original_price'])) {
    $orig = floatval($cart_item['_bmsm_original_price']);
    if (isset($cart_item['data']) && is_object($cart_item['data'])) {
      $cart_item['data']->set_price($orig);
    }
  }
}

// -------------------------------
// Apply BMSM (Method A)
// -------------------------------
add_action('woocommerce_before_calculate_totals', function($cart){
  if (!($cart instanceof WC_Cart)) return;
  if (is_admin() && !defined('DOING_AJAX')) return;
  if (did_action('woocommerce_before_calculate_totals') > 1) {
    // prevent weird double-run cascades; still safe because we restore from original
  }

  $qty_by_parent = bmsm_build_qty_by_parent($cart);
  if (empty($qty_by_parent)) return;

  // Exclusive guard: if product is covered by FBT, skip BMSM for that product
  $fbt_covered = bmsm_get_fbt_covered_products($cart);
  $fbt_covered_map = array_fill_keys(array_map('intval', $fbt_covered), true);

  // Preload per-parent rate
  $rate_by_parent = [];

  foreach ($qty_by_parent as $parent_id => $qty) {
    $parent_id = intval($parent_id);

    // If FBT covers this product, we skip BMSM (and later restore price)
    if (isset($fbt_covered_map[$parent_id])) {
      $rate_by_parent[$parent_id] = 0.0;
      continue;
    }

    $enabled = get_post_meta($parent_id, BMSM_META_ENABLED, true);
    if ($enabled !== '1') {
      $rate_by_parent[$parent_id] = 0.0;
      continue;
    }

    $rules_json = get_post_meta($parent_id, BMSM_META_RULES, true);
    $rules = bmsm_sanitize_rules($rules_json);
    if (empty($rules)) {
      $rate_by_parent[$parent_id] = 0.0;
      continue;
    }

    $rate = bmsm_pick_rate($rules, intval($qty));
    $rate_by_parent[$parent_id] = $rate > 0 ? $rate : 0.0;
  }

  // Apply to cart items
  foreach ($cart->get_cart() as &$cart_item) {
    $parent_id = intval($cart_item['product_id']);
    if ($parent_id <= 0) continue;

    // stash original price once
    if (!isset($cart_item['_bmsm_original_price'])) {
      $base = isset($cart_item['data']) && is_object($cart_item['data'])
        ? floatval($cart_item['data']->get_price())
        : 0.0;
      $cart_item['_bmsm_original_price'] = $base;
    }

    $rate = floatval($rate_by_parent[$parent_id] ?? 0.0);

    if ($rate <= 0) {
      // restore if previously discounted
      bmsm_restore_original_price($cart_item);
      unset($cart_item['_bmsm_applied_rate']);
      continue;
    }

    $orig = floatval($cart_item['_bmsm_original_price']);
    if ($orig <= 0) continue;

    $new_price = round($orig * (1.0 - $rate), wc_get_price_decimals());
    $cart_item['data']->set_price($new_price);
    $cart_item['_bmsm_applied_rate'] = $rate;
  }

}, 15);


/**
 * BMSM Index REST API Endpoint
 * 
 * Provides lightweight endpoint to list only products with BMSM configured.
 * Query wp_postmeta directly instead of loading full products.
 * 
 * Register this in your WordPress theme's functions.php or as a plugin.
 */

/**
 * Register BMSM REST API routes
 */
add_action('rest_api_init', function() {
    register_rest_route('bmsm/v1', '/index', array(
        'methods' => 'GET',
        'callback' => 'bmsm_get_index',
        'permission_callback' => 'bmsm_check_permission',
        'args' => array(
            'page' => array(
                'default' => 1,
                'sanitize_callback' => 'absint',
            ),
            'per_page' => array(
                'default' => 50,
                'sanitize_callback' => 'absint',
            ),
            'search' => array(
                'default' => '',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'filter' => array(
                'default' => 'all',
                'sanitize_callback' => 'sanitize_text_field',
            ),
        ),
    ));
    
    register_rest_route('bmsm/v1', '/rebuild-index', array(
        'methods' => 'POST',
        'callback' => 'bmsm_rebuild_index',
        'permission_callback' => 'bmsm_check_permission',
    ));
});

/**
 * Check if user has permission to access BMSM endpoints
 */
function bmsm_check_permission() {
    return current_user_can('manage_woocommerce');
}

/**
 * Get BMSM index (products with BMSM configured)
 */
function bmsm_get_index($request) {
    global $wpdb;
    
    $page = $request->get_param('page');
    $per_page = $request->get_param('per_page');
    $search = $request->get_param('search');
    $filter = $request->get_param('filter');
    
    // Validate per_page (max 100)
    $per_page = min($per_page, 100);
    $offset = ($page - 1) * $per_page;
    
    // Step 1: Find product IDs that have BMSM meta
    // Products with _bmsm_enabled='1' OR _bmsm_rules non-empty
    $meta_table = $wpdb->postmeta;
    $posts_table = $wpdb->posts;
    
    $sql = "
        SELECT DISTINCT pm.post_id
        FROM {$meta_table} pm
        INNER JOIN {$posts_table} p ON pm.post_id = p.ID
        WHERE p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft', 'private')
        AND (
            (pm.meta_key = '_bmsm_enabled' AND pm.meta_value = '1')
            OR (pm.meta_key = '_bmsm_rules' AND pm.meta_value != '' AND pm.meta_value != '[]')
        )
    ";
    
    // Apply search filter if provided
    if (!empty($search)) {
        $search_escaped = esc_sql($wpdb->esc_like($search));
        if (is_numeric($search)) {
            // Search by ID
            $sql .= $wpdb->prepare(" AND pm.post_id = %d", intval($search));
        } else {
            // Search by title
            $sql .= $wpdb->prepare(" AND p.post_title LIKE %s", '%' . $search_escaped . '%');
        }
    }
    
    // Get all matching product IDs
    $product_ids = $wpdb->get_col($sql);
    
    if (empty($product_ids)) {
        return new WP_REST_Response(array(
            'items' => array(),
            'total' => 0,
            'page' => $page,
            'per_page' => $per_page,
        ), 200);
    }
    
    // Step 2: For each product, get its meta and compute stats
    $items = array();
    foreach ($product_ids as $product_id) {
        $enabled_meta = get_post_meta($product_id, '_bmsm_enabled', true);
        $rules_meta = get_post_meta($product_id, '_bmsm_rules', true);
        
        $enabled = ($enabled_meta === '1');
        $rules_json = $rules_meta ? $rules_meta : '';
        
        // Parse and compute stats
        $stats = bmsm_parse_rules_stats($rules_json);
        
        // Apply filter
        if ($filter === 'enabled' && !$enabled) {
            continue;
        }
        if ($filter === 'disabled_with_rules' && ($enabled || $stats['tier_count'] == 0)) {
            continue;
        }
        if ($filter === 'invalid' && $stats['status'] !== 'invalid_json') {
            continue;
        }
        if ($filter === 'with_rules' && $stats['tier_count'] == 0) {
            continue;
        }
        if ($filter === 'no_rules' && $stats['tier_count'] > 0) {
            continue;
        }
        
        // Get product basic info
        $product = wc_get_product($product_id);
        if (!$product) {
            continue;
        }
        
        $items[] = array(
            'id' => $product_id,
            'name' => $product->get_name(),
            'type' => $product->get_type(),
            'enabled' => $enabled,
            'tier_count' => $stats['tier_count'],
            'max_rate' => $stats['max_rate'],
            'max_percent' => $stats['max_percent'],
            'min_qty_min' => $stats['min_qty_min'],
            'min_qty_max' => $stats['min_qty_max'],
            'status' => $stats['status'],
        );
    }
    
    // Step 3: Sort by product ID (or name if preferred)
    usort($items, function($a, $b) {
        return $a['id'] - $b['id'];
    });
    
    // Step 4: Paginate
    $total = count($items);
    $items = array_slice($items, $offset, $per_page);
    
    return new WP_REST_Response(array(
        'items' => $items,
        'total' => $total,
        'page' => $page,
        'per_page' => $per_page,
    ), 200);
}

/**
 * Parse BMSM rules JSON and compute stats
 * 
 * @param string $rules_json JSON string of rules
 * @return array Stats: tier_count, max_rate, max_percent, min_qty_min, min_qty_max, status
 */
function bmsm_parse_rules_stats($rules_json) {
    $default_stats = array(
        'tier_count' => 0,
        'max_rate' => null,
        'max_percent' => null,
        'min_qty_min' => null,
        'min_qty_max' => null,
        'status' => 'empty_rules',
    );
    
    if (empty($rules_json) || $rules_json === '[]' || trim($rules_json) === '') {
        return $default_stats;
    }
    
    // Try to parse JSON
    $rules = json_decode($rules_json, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        return array_merge($default_stats, array('status' => 'invalid_json'));
    }
    
    if (!is_array($rules) || empty($rules)) {
        return $default_stats;
    }
    
    // Compute stats
    $tier_count = count($rules);
    $max_rate = null;
    $max_percent = null;
    $min_qty_min = null;
    $min_qty_max = null;
    
    foreach ($rules as $rule) {
        if (!is_array($rule) || !isset($rule['min']) || !isset($rule['rate'])) {
            continue;
        }
        
        $min = intval($rule['min']);
        $rate = floatval($rule['rate']);
        
        if ($max_rate === null || $rate > $max_rate) {
            $max_rate = $rate;
            $max_percent = intval($rate * 100);
        }
        
        if ($min_qty_min === null || $min < $min_qty_min) {
            $min_qty_min = $min;
        }
        
        if ($min_qty_max === null || $min > $min_qty_max) {
            $min_qty_max = $min;
        }
    }
    
    return array(
        'tier_count' => $tier_count,
        'max_rate' => $max_rate,
        'max_percent' => $max_percent,
        'min_qty_min' => $min_qty_min,
        'min_qty_max' => $min_qty_max,
        'status' => 'valid',
    );
}

/**
 * Rebuild index (optional - for caching if needed)
 * Currently just returns success since we query directly each time
 */
function bmsm_rebuild_index($request) {
    // If you implement caching, rebuild it here
    // For now, we query directly, so just return success
    return new WP_REST_Response(array(
        'success' => true,
        'message' => 'Index rebuild not needed (direct query)',
    ), 200);
}

