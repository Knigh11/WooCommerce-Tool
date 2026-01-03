<?php


if (!defined('ABSPATH')) exit;

/**
 * ==========================================================
 * BMSM - V4 (PHP 7.0 - 7.3)
 * ==========================================================
 * Meta keys on PARENT product:
 *  - _bmsm_enabled: "1" or "0"
 *  - _bmsm_rules  : JSON string [{"min":2,"rate":0.05}, ...]
 *
 * What it does:
 * 1) Apply BMSM via set_price() (parent aggregate qty)
 * 2) Show totals row: Discount by offer (BMSM) -$xx (included)
 * 3) Mini-cart line works across pages (no dependency on calculate_totals timing)
 * 4) Cart item price/subtotal show <del>base</del> <ins>discounted</ins>
 * 5) Product page tiers box under qty input
 */

if (!defined('MMB_BMSM_META_ENABLED')) define('MMB_BMSM_META_ENABLED', '_bmsm_enabled');
if (!defined('MMB_BMSM_META_RULES'))   define('MMB_BMSM_META_RULES',   '_bmsm_rules');

/* ---------------------------
   Rules parse/pick
--------------------------- */
if (!function_exists('mmb3_bmsm_sort_rules_by_min')) {
  function mmb3_bmsm_sort_rules_by_min($a, $b) {
    $am = isset($a['min']) ? (int)$a['min'] : 0;
    $bm = isset($b['min']) ? (int)$b['min'] : 0;
    if ($am == $bm) return 0;
    return ($am < $bm) ? -1 : 1;
  }
}

if (!function_exists('mmb3_bmsm_rules_parse')) {
  function mmb3_bmsm_rules_parse($raw) {
    if (is_string($raw)) {
      $decoded = json_decode($raw, true);
      $rules = is_array($decoded) ? $decoded : array();
    } else {
      $rules = is_array($raw) ? $raw : array();
    }

    $out = array();
    foreach ($rules as $r) {
      if (!is_array($r)) continue;
      $min  = isset($r['min'])  ? (int)$r['min']  : 0;
      $rate = isset($r['rate']) ? (float)$r['rate'] : 0.0;

      if ($min < 2) continue;
      if ($rate <= 0) continue;
      if ($rate > 0.95) $rate = 0.95;

      $out[] = array('min' => $min, 'rate' => $rate);
    }

    usort($out, 'mmb3_bmsm_sort_rules_by_min');
    return $out;
  }
}

if (!function_exists('mmb3_bmsm_pick_rate')) {
  function mmb3_bmsm_pick_rate($rules, $qty) {
    $rate = 0.0;
    $qty  = (int)$qty;
    if (!is_array($rules)) return 0.0;

    foreach ($rules as $r) {
      if (!is_array($r)) continue;
      $min = isset($r['min']) ? (int)$r['min'] : 0;
      if ($qty >= $min) $rate = isset($r['rate']) ? (float)$r['rate'] : 0.0;
    }
    return (float)$rate;
  }
}

if (!function_exists('mmb3_bmsm_get_rules_for_parent')) {
  function mmb3_bmsm_get_rules_for_parent($parent_id) {
    $enabled = get_post_meta($parent_id, MMB_BMSM_META_ENABLED, true);
    if ((string)$enabled !== '1') return array();
    $raw = get_post_meta($parent_id, MMB_BMSM_META_RULES, true);
    return mmb3_bmsm_rules_parse($raw);
  }
}

/* ---------------------------
   Base price persistence
--------------------------- */
if (!function_exists('mmb3_bmsm_get_raw_price')) {
  function mmb3_bmsm_get_raw_price($product_obj) {
    if (!$product_obj) return 0.0;

    if (method_exists($product_obj, 'get_price')) {
      // try edit context if available
      try {
        $p = $product_obj->get_price('edit');
        if ($p !== '' && $p !== null) return (float)$p;
      } catch (Exception $e) {}
      return (float)$product_obj->get_price();
    }
    return 0.0;
  }
}

if (!function_exists('mmb3_bmsm_add_cart_item_data')) {
  function mmb3_bmsm_add_cart_item_data($cart_item_data, $product_id, $variation_id) {
    if (!function_exists('wc_get_product')) return $cart_item_data;

    $pid = $variation_id ? (int)$variation_id : (int)$product_id;
    $p = wc_get_product($pid);
    if ($p) {
      $cart_item_data['_mmb3_bmsm_base_price'] = (float)mmb3_bmsm_get_raw_price($p);
    }
    return $cart_item_data;
  }
}
add_filter('woocommerce_add_cart_item_data', 'mmb3_bmsm_add_cart_item_data', 10, 3);

if (!function_exists('mmb3_bmsm_restore_from_session')) {
  function mmb3_bmsm_restore_from_session($cart_item, $values, $key) {
    if (isset($values['_mmb3_bmsm_base_price'])) {
      $cart_item['_mmb3_bmsm_base_price'] = (float)$values['_mmb3_bmsm_base_price'];
    }
    return $cart_item;
  }
}
add_filter('woocommerce_get_cart_item_from_session', 'mmb3_bmsm_restore_from_session', 10, 3);

if (!function_exists('mmb3_bmsm_item_base_price')) {
  function mmb3_bmsm_item_base_price($item) {
    if (isset($item['_mmb3_bmsm_base_price']) && (float)$item['_mmb3_bmsm_base_price'] > 0) {
      return (float)$item['_mmb3_bmsm_base_price'];
    }
    // fallback for old cart items
    if (!function_exists('wc_get_product')) return 0.0;

    $vid = isset($item['variation_id']) ? (int)$item['variation_id'] : 0;
    $pid = isset($item['product_id']) ? (int)$item['product_id'] : 0;
    $pid_for_price = ($vid > 0) ? $vid : $pid;
    if ($pid_for_price <= 0) return 0.0;

    $p = wc_get_product($pid_for_price);
    if (!$p) return 0.0;

    return (float)mmb3_bmsm_get_raw_price($p);
  }
}

/* ---------------------------
   Rate map by parent (independent of calculate_totals)
--------------------------- */
if (!function_exists('mmb3_bmsm_rate_map')) {
  function mmb3_bmsm_rate_map($cart) {
    if (!($cart instanceof WC_Cart)) return array();

    $qty_by_parent = array();
    foreach ($cart->get_cart() as $item) {
      $parent_id = isset($item['product_id']) ? (int)$item['product_id'] : 0;
      $q = isset($item['quantity']) ? (int)$item['quantity'] : 0;
      if ($parent_id <= 0 || $q <= 0) continue;
      $qty_by_parent[$parent_id] = (isset($qty_by_parent[$parent_id]) ? $qty_by_parent[$parent_id] : 0) + $q;
    }

    $rate_by_parent = array();
    foreach ($qty_by_parent as $parent_id => $qty) {
      $rules = mmb3_bmsm_get_rules_for_parent($parent_id);
      $rate_by_parent[$parent_id] = !empty($rules) ? (float)mmb3_bmsm_pick_rate($rules, $qty) : 0.0;
    }

    return $rate_by_parent;
  }
}

/* ---------------------------
   Apply set_price (cart/checkout pricing)
--------------------------- */
if (!function_exists('mmb3_bmsm_apply_set_price')) {
  function mmb3_bmsm_apply_set_price($cart) {
    if (!($cart instanceof WC_Cart)) return;
    if (is_admin() && !defined('DOING_AJAX')) return;

    $rate_by_parent = mmb3_bmsm_rate_map($cart);
    if (empty($rate_by_parent)) return;

    foreach ($cart->get_cart() as $key => $item) {
      $parent_id = isset($item['product_id']) ? (int)$item['product_id'] : 0;
      if ($parent_id <= 0) continue;
      if (empty($item['data']) || !is_object($item['data'])) continue;

      $rate = isset($rate_by_parent[$parent_id]) ? (float)$rate_by_parent[$parent_id] : 0.0;
      $base = mmb3_bmsm_item_base_price($item);
      if ($base <= 0) continue;

      // persist base if missing
      if (!isset($cart->cart_contents[$key]['_mmb3_bmsm_base_price']) || (float)$cart->cart_contents[$key]['_mmb3_bmsm_base_price'] <= 0) {
        $cart->cart_contents[$key]['_mmb3_bmsm_base_price'] = (float)$base;
      }

      if ($rate <= 0) {
        $item['data']->set_price($base);
        continue;
      }

      $new_price = round($base * (1.0 - $rate), wc_get_price_decimals());
      $item['data']->set_price($new_price);
    }
  }
}
add_action('woocommerce_before_calculate_totals', 'mmb3_bmsm_apply_set_price', 9999);

/* ---------------------------
   Savings amount (matches set_price rounding)
   Works on ANY page (mini-cart included)
--------------------------- */
if (!function_exists('mmb3_bmsm_savings_amount')) {
  function mmb3_bmsm_savings_amount($cart) {
    if (!($cart instanceof WC_Cart)) return 0.0;

    $rate_by_parent = mmb3_bmsm_rate_map($cart);
    if (empty($rate_by_parent)) return 0.0;

    $saved = 0.0;
    $dec = wc_get_price_decimals();

    foreach ($cart->get_cart() as $item) {
      $parent_id = isset($item['product_id']) ? (int)$item['product_id'] : 0;
      $qty = isset($item['quantity']) ? (int)$item['quantity'] : 0;
      if ($parent_id <= 0 || $qty <= 0) continue;

      $rate = isset($rate_by_parent[$parent_id]) ? (float)$rate_by_parent[$parent_id] : 0.0;
      if ($rate <= 0) continue;

      $base = mmb3_bmsm_item_base_price($item);
      if ($base <= 0) continue;

      // match set_price rounding per unit
      $new_price = round($base * (1.0 - $rate), $dec);
      $saved += max(0.0, ($base - $new_price)) * $qty;
    }

    $saved = round($saved, $dec);
    return ($saved > 0) ? $saved : 0.0;
  }
}

/* ---------------------------
   Totals row (cart + checkout)
--------------------------- */
if (!function_exists('mmb3_bmsm_render_row_once')) {
  function mmb3_bmsm_render_row_once() {
    static $done = false;
    if ($done) return;
    $done = true;

    if (!function_exists('WC') || !WC()->cart) return;
    $saved = mmb3_bmsm_savings_amount(WC()->cart);
    if ($saved <= 0) return;

    echo '<tr class="mmb3-bmsm-row">
      <th>Discount by offer (BMSM)</th>
      <td>- ' . wc_price($saved) . ' <small style="opacity:.7;">(included)</small></td>
    </tr>';
  }
}
add_action('woocommerce_cart_totals_after_subtotal', 'mmb3_bmsm_render_row_once', 20);
add_action('woocommerce_review_order_after_subtotal', 'mmb3_bmsm_render_row_once', 20);

/* ---------------------------
   Cart item price + subtotal show base strikethrough
--------------------------- */
if (!function_exists('mmb3_bmsm_cart_item_price_html')) {
  function mmb3_bmsm_cart_item_price_html($price_html, $cart_item, $cart_item_key) {
    if (!function_exists('WC') || !WC()->cart) return $price_html;

    $base = mmb3_bmsm_item_base_price($cart_item);
    if ($base <= 0) return $price_html;

    $parent_id = isset($cart_item['product_id']) ? (int)$cart_item['product_id'] : 0;
    $rate_by_parent = mmb3_bmsm_rate_map(WC()->cart);
    $rate = isset($rate_by_parent[$parent_id]) ? (float)$rate_by_parent[$parent_id] : 0.0;
    if ($rate <= 0) return $price_html;

    $cur = (float)$cart_item['data']->get_price();
    if ($cur <= 0 || $base <= $cur) return $price_html;

    return '<del>' . wc_price($base) . '</del> <ins>' . wc_price($cur) . '</ins>';
  }
}
add_filter('woocommerce_cart_item_price', 'mmb3_bmsm_cart_item_price_html', 10, 3);

if (!function_exists('mmb3_bmsm_cart_item_subtotal_html')) {
  function mmb3_bmsm_cart_item_subtotal_html($subtotal_html, $cart_item, $cart_item_key) {
    if (!function_exists('WC') || !WC()->cart) return $subtotal_html;

    $qty = isset($cart_item['quantity']) ? (int)$cart_item['quantity'] : 0;
    if ($qty <= 0) return $subtotal_html;

    $base = mmb3_bmsm_item_base_price($cart_item);
    if ($base <= 0) return $subtotal_html;

    $parent_id = isset($cart_item['product_id']) ? (int)$cart_item['product_id'] : 0;
    $rate_by_parent = mmb3_bmsm_rate_map(WC()->cart);
    $rate = isset($rate_by_parent[$parent_id]) ? (float)$rate_by_parent[$parent_id] : 0.0;
    if ($rate <= 0) return $subtotal_html;

    $cur = (float)$cart_item['data']->get_price();
    if ($cur <= 0 || $base <= $cur) return $subtotal_html;

    $base_sub = $base * $qty;
    $cur_sub  = $cur * $qty;

    return '<del>' . wc_price($base_sub) . '</del> <ins>' . wc_price($cur_sub) . '</ins>';
  }
}
add_filter('woocommerce_cart_item_subtotal', 'mmb3_bmsm_cart_item_subtotal_html', 10, 3);

/* ---------------------------
   Mini-cart line (reliable across pages)
   Hook multiple places + guard to avoid duplicates
--------------------------- */
if (!function_exists('mmb3_bmsm_mini_html')) {
  function mmb3_bmsm_mini_html() {
    if (!function_exists('WC') || !WC()->cart) return '<div class="mmb3-bmsm-mini" style="display:none;"></div>';

    $saved = mmb3_bmsm_savings_amount(WC()->cart);
    if ($saved <= 0) return '<div class="mmb3-bmsm-mini" style="display:none;"></div>';

    return '<div class="mmb3-bmsm-mini" style="margin:8px 0 0; font-size:12px; opacity:.95;">
      Discount by offer: <strong>- ' . wc_price($saved) . '</strong> <span style="opacity:.7;">(included)</span>
    </div>';
  }
}

if (!function_exists('mmb3_bmsm_echo_mini_once')) {
  function mmb3_bmsm_echo_mini_once() {
    static $done = false;
    if ($done) return;
    $done = true;
    echo mmb3_bmsm_mini_html();
  }
}

// Try both hooks (themes differ)
add_action('woocommerce_widget_shopping_cart_before_buttons', 'mmb3_bmsm_echo_mini_once', 20);
add_action('woocommerce_after_mini_cart', 'mmb3_bmsm_echo_mini_once', 20);

// AJAX fragments update
if (!function_exists('mmb3_bmsm_fragments')) {
  function mmb3_bmsm_fragments($fragments) {
    $fragments['div.mmb3-bmsm-mini'] = mmb3_bmsm_mini_html();
    return $fragments;
  }
}
add_filter('woocommerce_add_to_cart_fragments', 'mmb3_bmsm_fragments');

/* ---------------------------
   Product page tiers box
--------------------------- */
if (!function_exists('mmb3_bmsm_product_box')) {
  function mmb3_bmsm_product_box() {
    if (!function_exists('is_product') || !is_product()) return;

    global $product;
    if (!$product || !is_a($product, 'WC_Product')) return;

    $parent_id = 0;
    if (method_exists($product, 'is_type') && $product->is_type('variation')) {
      $parent_id = (int)$product->get_parent_id();
    } else {
      $parent_id = (int)$product->get_id();
    }
    if ($parent_id <= 0) return;

    $rules = mmb3_bmsm_get_rules_for_parent($parent_id);
    if (empty($rules)) return;

    echo '<div class="mmb3-bmsm-box" data-mmb3-bmsm style="margin-top:10px; padding:10px; border:1px solid rgba(0,0,0,.08); border-radius:8px;">';
    echo '<div style="font-weight:700; margin-bottom:6px;">Buy More Save More</div>';
    echo '<div style="font-size:12px; opacity:.8; margin-bottom:8px;">Discount auto-applies in cart at eligible quantities.</div>';
    echo '<ul class="mmb3-bmsm-tiers" style="list-style:none; padding:0; margin:0;">';

    foreach ($rules as $r) {
      $min  = isset($r['min']) ? (int)$r['min'] : 0;
      $rate = isset($r['rate']) ? (float)$r['rate'] : 0.0;
      if ($min < 2 || $rate <= 0) continue;
      $pct = (int)round($rate * 100);

      echo '<li data-min="' . esc_attr($min) . '" data-rate="' . esc_attr($rate) . '" style="display:flex; justify-content:space-between; padding:6px 0; border-top:1px solid rgba(0,0,0,.06);">';
      echo '<span>Buy ' . $min . '+</span>';
      echo '<span style="font-weight:700;">Save ' . $pct . '%</span>';
      echo '</li>';
    }

    echo '</ul>';
    echo '<div data-mmb3-bmsm-hint style="margin-top:8px; font-size:12px; opacity:.85;"></div>';
    echo '</div>';
    ?>
    <script>
    (function(){
      var box = document.querySelector('[data-mmb3-bmsm]');
      if (!box) return;
      var hint = box.querySelector('[data-mmb3-bmsm-hint]');
      var qtyInput = document.querySelector('form.cart input.qty');

      var lis = box.querySelectorAll('.mmb3-bmsm-tiers li[data-min][data-rate]');
      var tiers = [];
      for (var i=0; i<lis.length; i++){
        tiers.push({min: parseInt(lis[i].getAttribute('data-min'),10), rate: parseFloat(lis[i].getAttribute('data-rate'))});
      }
      tiers.sort(function(a,b){ return a.min - b.min; });

      function pick(qty){
        var best = null;
        for (var j=0; j<tiers.length; j++) if (qty >= tiers[j].min) best = tiers[j];
        return best;
      }

      function render(){
        var qty = 1;
        if (qtyInput && qtyInput.value){
          qty = parseInt(qtyInput.value,10);
          if (isNaN(qty) || qty < 1) qty = 1;
        }
        if (!hint) return;

        var best = pick(qty);
        if (best){
          hint.textContent = 'Unlocked: ' + Math.round(best.rate*100) + '% off at qty ' + qty + '. Discount applies in cart.';
        } else if (tiers.length){
          var next = tiers[0];
          var need = next.min - qty;
          if (need < 0) need = 0;
          hint.textContent = (need > 0) ? ('Add ' + need + ' more to unlock ' + Math.round(next.rate*100) + '% off.') : 'Discount applies in cart.';
        }
      }

      if (qtyInput){
        qtyInput.addEventListener('input', render);
        qtyInput.addEventListener('change', render);
      }
      render();
    })();
    </script>
    <?php
  }
}
add_action('woocommerce_after_add_to_cart_quantity', 'mmb3_bmsm_product_box', 25);
