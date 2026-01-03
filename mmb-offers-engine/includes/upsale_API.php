<?php
/**
 * FBT Combo (Option B) - REST API + Index + Meta sync + Cart Discount
 * Drop-in snippet (no plugin activation needed)
 *
 * Endpoints:
 *  GET    /wp-json/fbt/v1/combos?search=&page=&per_page=
 *  GET    /wp-json/fbt/v1/combos/{main_id}
 *  PUT    /wp-json/fbt/v1/combos/{main_id}
 *  POST   /wp-json/fbt/v1/combos/{main_id}  (fallback if PUT blocked)
 *  DELETE /wp-json/fbt/v1/combos/{main_id}
 *
 * NEW:
 * - apply_scope: "main_only" | "all_in_combo"
 * - main_ids: array (used when main_only)
 * - product_ids: full group
 * - group_key: hash for deleting/updating entire group cleanly
 */

if (!defined('ABSPATH')) exit;

const FBT_INDEX_OPTION = 'fbt_combo_index';       // array of main_ids
const FBT_ITEM_PREFIX  = 'fbt_combo_';            // fbt_combo_{main_id}
const FBT_META_ENABLED = '_fbt_enabled';
const FBT_META_IDS     = '_fbt_combo_ids';
const FBT_META_RULES   = '_fbt_discount_rules';

// -------------------------------
// Helpers: sanitize + storage
// -------------------------------
function fbt_now_iso() {
  return gmdate('c');
}

function fbt_sanitize_ids($ids) {
  if (!is_array($ids)) return [];
  return array_values(array_unique(array_filter(array_map('intval', $ids))));
}

function fbt_group_key(array $product_ids) {
  $ids = fbt_sanitize_ids($product_ids);
  sort($ids);
  return substr(sha1(implode(',', $ids)), 0, 12);
}

function fbt_get_index() {
  $idx = get_option(FBT_INDEX_OPTION, []);
  return is_array($idx) ? array_values(array_unique(array_map('intval', $idx))) : [];
}

function fbt_set_index(array $main_ids) {
  $main_ids = array_values(array_unique(array_filter(array_map('intval', $main_ids))));
  update_option(FBT_INDEX_OPTION, $main_ids, false); // autoload = no
}

function fbt_item_key($main_id) {
  return FBT_ITEM_PREFIX . intval($main_id);
}

function fbt_get_combo($main_id) {
  $data = get_option(fbt_item_key($main_id), null);
  return is_array($data) ? $data : null;
}

function fbt_set_combo($main_id, array $combo) {
  $main_id = intval($main_id);

  // store item
  update_option(fbt_item_key($main_id), $combo, false);

  // update index
  $idx = fbt_get_index();
  if (!in_array($main_id, $idx, true)) {
    $idx[] = $main_id;
    fbt_set_index($idx);
  }
}

function fbt_delete_combo($main_id) {
  $main_id = intval($main_id);

  delete_option(fbt_item_key($main_id));

  $idx = fbt_get_index();
  $idx = array_values(array_diff($idx, [$main_id]));
  fbt_set_index($idx);
}

function fbt_clear_meta($main_id) {
  $main_id = intval($main_id);
  update_post_meta($main_id, FBT_META_ENABLED, '0');
  update_post_meta($main_id, FBT_META_IDS, []);
  update_post_meta($main_id, FBT_META_RULES, '');
}

function fbt_delete_group_by_key($group_key) {
  if (!$group_key) return;
  $idx_snapshot = fbt_get_index(); // snapshot so we can safely mutate index during deletes

  foreach ($idx_snapshot as $mid) {
    $c = fbt_get_combo($mid);
    if (!$c) continue;
    if (($c['group_key'] ?? '') !== $group_key) continue;

    fbt_clear_meta($mid);
    fbt_delete_combo($mid);
  }
}

function fbt_sanitize_rules($rules) {
  // rules: [{min:2, rate:0.05}, ...]
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
  // sort by min asc
  usort($out, function($a,$b){ return $a['min'] <=> $b['min']; });
  return $out;
}

function fbt_pick_rate(array $rules, int $count) {
  $rate = 0.0;
  foreach ($rules as $r) {
    if ($count >= intval($r['min'])) $rate = floatval($r['rate']);
  }
  return $rate;
}

function fbt_sync_meta($main_id, array $combo) {
  $main_id = intval($main_id);

  // enable flag
  update_post_meta($main_id, FBT_META_ENABLED, !empty($combo['enabled']) ? '1' : '0');

  // ids (array of ints)
  $ids = isset($combo['combo_ids']) && is_array($combo['combo_ids']) ? $combo['combo_ids'] : [];
  $ids = fbt_sanitize_ids($ids);
  update_post_meta($main_id, FBT_META_IDS, $ids);

  // rules JSON string
  $rules = isset($combo['discount_rules']) && is_array($combo['discount_rules']) ? $combo['discount_rules'] : [];
  $rules = fbt_sanitize_rules($rules);
  update_post_meta($main_id, FBT_META_RULES, wp_json_encode($rules));
}

function fbt_product_exists($product_id) {
  $p = function_exists('wc_get_product') ? wc_get_product($product_id) : null;
  return $p ? true : false;
}

// -------------------------------
// REST API
// -------------------------------
add_action('rest_api_init', function () {

  register_rest_route('fbt/v1', '/combos', [
    'methods'  => 'GET',
    'callback' => function(WP_REST_Request $req){
      if (!current_user_can('manage_woocommerce')) {
        return new WP_REST_Response(['error'=>'forbidden'], 403);
      }

      $search   = trim((string)$req->get_param('search'));
      $page     = max(1, intval($req->get_param('page') ?: 1));
      $per_page = min(200, max(1, intval($req->get_param('per_page') ?: 50)));

      $idx = fbt_get_index();

      // filter by search: match main_id or product title contains
      if ($search !== '') {
        $needle = mb_strtolower($search);
        $filtered = [];
        foreach ($idx as $mid) {
          if (strpos((string)$mid, $needle) !== false) { $filtered[] = $mid; continue; }
          $title = get_the_title($mid);
          if ($title && mb_strpos(mb_strtolower($title), $needle) !== false) $filtered[] = $mid;
        }
        $idx = $filtered;
      }

      $total = count($idx);
      $offset = ($page - 1) * $per_page;
      $slice = array_slice($idx, $offset, $per_page);

      $items = [];
      foreach ($slice as $mid) {
        $combo = fbt_get_combo($mid);
        if (!$combo) continue;

        $items[] = [
          'main_id'        => intval($mid),
          'main_name'      => get_the_title($mid),
          'enabled'        => !empty($combo['enabled']),
          'apply_scope'    => $combo['apply_scope'] ?? 'main_only',
          'group_key'      => $combo['group_key'] ?? null,
          'combo_count'    => isset($combo['combo_ids']) && is_array($combo['combo_ids']) ? count($combo['combo_ids']) : 0,
          'discount_rules' => $combo['discount_rules'] ?? [],
          'updated_at'     => $combo['updated_at'] ?? null,
        ];
      }

      return new WP_REST_Response([
        'page' => $page,
        'per_page' => $per_page,
        'total' => $total,
        'items' => $items
      ], 200);
    },
    'permission_callback' => '__return_true',
  ]);

  register_rest_route('fbt/v1', '/combos/(?P<main_id>\d+)', [
    [
      'methods'  => 'GET',
      'callback' => function(WP_REST_Request $req){
        if (!current_user_can('manage_woocommerce')) {
          return new WP_REST_Response(['error'=>'forbidden'], 403);
        }

        $main_id = intval($req['main_id']);
        $combo = fbt_get_combo($main_id);
        if (!$combo) return new WP_REST_Response(['error'=>'not_found'], 404);

        $combo['main_id'] = $main_id;
        $combo['main_name'] = get_the_title($main_id);

        return new WP_REST_Response($combo, 200);
      },
      'permission_callback' => '__return_true',
    ],
    [
      // PUT (or POST fallback) create/update
      'methods'  => ['PUT','POST'],
      'callback' => function(WP_REST_Request $req){
        if (!current_user_can('manage_woocommerce')) {
          return new WP_REST_Response(['error'=>'forbidden'], 403);
        }

        $url_main_id = intval($req['main_id']);
        if ($url_main_id <= 0) return new WP_REST_Response(['error'=>'invalid_main_id'], 400);
        if (!fbt_product_exists($url_main_id)) return new WP_REST_Response(['error'=>'main_product_not_found'], 404);

        $body = $req->get_json_params();
        if (!is_array($body)) $body = [];

        $enabled = !empty($body['enabled']);

        // NEW: apply_scope
        $apply_scope = isset($body['apply_scope']) ? (string)$body['apply_scope'] : 'main_only';
        if (!in_array($apply_scope, ['main_only','all_in_combo'], true)) {
          $apply_scope = 'main_only';
        }

        // optional main_ids (for MAIN_ONLY multi-main)
        $main_ids = fbt_sanitize_ids($body['main_ids'] ?? []);
        if (empty($main_ids)) $main_ids = [$url_main_id];

        // combo_ids (items)
        $combo_ids = fbt_sanitize_ids($body['combo_ids'] ?? []);
        // remove any mains from items (avoid duplicates)
        $combo_ids = array_values(array_diff($combo_ids, $main_ids));

        // validate products exist
        $valid_mains = [];
        foreach ($main_ids as $mid) {
          if ($mid > 0 && fbt_product_exists($mid)) $valid_mains[] = $mid;
        }
        if (empty($valid_mains)) return new WP_REST_Response(['error'=>'no_valid_main_ids'], 400);

        $valid_items = [];
        foreach ($combo_ids as $pid) {
          if ($pid > 0 && fbt_product_exists($pid)) $valid_items[] = $pid;
        }

        // Build group products
        $product_ids = fbt_sanitize_ids(array_merge($valid_mains, $valid_items));
        if (count($product_ids) < 2) {
          return new WP_REST_Response(['error'=>'combo_requires_at_least_2_products'], 400);
        }

        // MAIN_ONLY: mains must be inside group
        foreach ($valid_mains as $mid) {
          if (!in_array($mid, $product_ids, true)) {
            return new WP_REST_Response(['error'=>'main_id_not_in_group'], 400);
          }
        }

        $rules = fbt_sanitize_rules($body['discount_rules'] ?? []);

        // Cleanup old group (prevents leftovers)
        $existing = fbt_get_combo($url_main_id);
        $old_group_key = is_array($existing) ? ($existing['group_key'] ?? '') : '';

        if ($old_group_key) {
          fbt_delete_group_by_key($old_group_key);
        } else if (is_array($existing)) {
          // old single-main format fallback
          fbt_clear_meta($url_main_id);
          fbt_delete_combo($url_main_id);
        }

        $group_key = fbt_group_key($product_ids);

        // Decide which mains to create records for
        $targets = ($apply_scope === 'all_in_combo') ? $product_ids : $valid_mains;

        $saved = [];
        foreach ($targets as $main_id) {
          // combo_ids for this main = group minus itself
          $ids_for_main = array_values(array_diff($product_ids, [$main_id]));

          $combo = [
            'enabled'        => $enabled,
            'apply_scope'    => $apply_scope,
            'group_key'      => $group_key,
            'product_ids'    => $product_ids,   // full group
            'main_ids'       => $valid_mains,   // reference (esp for main_only)
            'combo_ids'      => $ids_for_main,  // what this main recommends
            'discount_rules' => $rules,
            'updated_at'     => fbt_now_iso(),
          ];

          fbt_set_combo($main_id, $combo);
          fbt_sync_meta($main_id, $combo);

          $saved[] = $main_id;
        }

        return new WP_REST_Response([
          'ok' => true,
          'apply_scope' => $apply_scope,
          'group_key' => $group_key,
          'product_ids' => $product_ids,
          'saved_main_ids' => $saved,
        ], 200);
      },
      'permission_callback' => '__return_true',
    ],
    [
      'methods'  => 'DELETE',
      'callback' => function(WP_REST_Request $req){
        if (!current_user_can('manage_woocommerce')) {
          return new WP_REST_Response(['error'=>'forbidden'], 403);
        }

        $main_id = intval($req['main_id']);
        $combo = fbt_get_combo($main_id);
        if (!$combo) return new WP_REST_Response(['error'=>'not_found'], 404);

        $group_key = $combo['group_key'] ?? '';

        if ($group_key) {
          // delete entire group
          fbt_delete_group_by_key($group_key);
          return new WP_REST_Response(['ok'=>true,'deleted_group_key'=>$group_key], 200);
        }

        // fallback: old single-main delete behavior
        fbt_clear_meta($main_id);
        fbt_delete_combo($main_id);

        return new WP_REST_Response(['ok'=>true,'deleted_main_id'=>$main_id], 200);
      },
      'permission_callback' => '__return_true',
    ],
  ]);

});

// -------------------------------
// Cart discount apply (real discount)
// -------------------------------
add_action('woocommerce_cart_calculate_fees', function($cart){
  if (is_admin() && !defined('DOING_AJAX')) return;
  if (!function_exists('WC') || !WC()->cart) return;

  // Build quantity & unit price map per parent product_id
  $qty = [];
  $unit = [];

  foreach ($cart->get_cart() as $item) {
    $pid = intval($item['product_id']); // parent id for variations too
    $q = intval($item['quantity']);
    if ($pid <= 0 || $q <= 0) continue;

    $qty[$pid] = ($qty[$pid] ?? 0) + $q;

    // unit price from line subtotal / qty
    $line_subtotal = floatval($item['line_subtotal']);
    if ($q > 0) {
      $unit[$pid] = ($unit[$pid] ?? 0) + ($line_subtotal / $q); // rough if multiple lines
    }
  }

  if (empty($qty)) return;

  $used = []; // prevent double-discount on same product across combos (simple guard)

  foreach (array_keys($qty) as $main_id) {
    // quick check enabled
    $enabled = get_post_meta($main_id, FBT_META_ENABLED, true);
    if ($enabled !== '1') continue;

    $combo_ids = get_post_meta($main_id, FBT_META_IDS, true);
    if (!is_array($combo_ids)) $combo_ids = [];
    $combo_ids = fbt_sanitize_ids($combo_ids);
    if (!$combo_ids) continue;

    $rules_json = get_post_meta($main_id, FBT_META_RULES, true);
    $rules = json_decode((string)$rules_json, true);
    $rules = is_array($rules) ? fbt_sanitize_rules($rules) : [];

    // Eligible products present in cart (distinct products)
    $present = [];
    foreach ($combo_ids as $pid) {
      if (!empty($qty[$pid])) $present[] = $pid;
    }

    // Include main itself
    $eligible_products = array_values(array_unique(array_merge([$main_id], $present)));

    // remove already-used (avoid stacking discounts)
    $eligible_products = array_values(array_diff($eligible_products, $used));

    $count = count($eligible_products);
    if ($count < 2) continue;

    $rate = fbt_pick_rate($rules, $count);
    if ($rate <= 0) continue;

    // Discount base amount: only 1 qty each (safe, prevents multi-qty over-discount)
    $base = 0.0;
    foreach ($eligible_products as $pid) {
      $q = intval($qty[$pid] ?? 0);
      if ($q <= 0) continue;
      $u = floatval($unit[$pid] ?? 0);
      $base += $u * min(1, $q);
    }

    if ($base <= 0) continue;

    $discount = round($base * $rate, wc_get_price_decimals());
    if ($discount <= 0) continue;

    $label = sprintf('Combo Discount (%d)', $main_id);
    $cart->add_fee($label, -$discount, false);

    // mark as used
    $used = array_values(array_unique(array_merge($used, $eligible_products)));
  }

}, 20);
