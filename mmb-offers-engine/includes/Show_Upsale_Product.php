<?php
if (!defined('ABSPATH')) exit;

/**
 * MMB FBT / Upsell Combo (Meta-based) - Apple-lite + Sales machine UI (CLEANED)
 * - Works on default Woo template (hook) + custom Flatsome layout (shortcode)
 * - Add via Woo AJAX, then RELOAD (Woo-style)
 * - Variable products: add the VARIATION ID as product_id (hard fix)
 * - Custom Name per item (fbt_custom_name), server-side validation + dedupe
 *
 * UI:
 * - Mobile: thumb strip + list rows + summary + CTA (no sticky bottom bar to avoid conflicts)
 * - Desktop/Tablet: responsive cards auto-fit columns, Quick View icon safe from theme invert
 *
 * Meta:
 *  - _fbt_enabled (string '1'/'0')
 *  - _fbt_combo_ids (array of product IDs)
 *  - _fbt_discount_rules (JSON string: [{"min":2,"rate":0.05}, ...])
 */

/* ========= Helper: detect personalized products by title keywords ========= */
if (!function_exists('fbt_needs_custom_name_by_title')) {
    function fbt_needs_custom_name_by_title($product_id) {
        $product_id = (int) $product_id;

        // If this is a variation, check parent title (more accurate)
        $parent_id = wp_get_post_parent_id($product_id);
        $check_id  = $parent_id ? (int)$parent_id : $product_id;

        $title = get_the_title($check_id);
        if (!$title) return false;

        $keywords = array('Custom', 'Jersey', 'Personalized', 'Personalise', 'Personalize', 'Custom Name', 'Name');

        foreach ($keywords as $kw) {
            if ($kw && stripos($title, $kw) !== false) return true;
        }
        return false;
    }
}

/* ========= Helper: build attribute choices EXACT from variations (no conversion) ========= */
if (!function_exists('fbt_build_attr_groups_from_variations')) {
    function fbt_build_attr_groups_from_variations($product, $available_variations) {
        $groups = [];
        if (!$product || !$product->is_type('variable')) return $groups;

        $vals_by_key = [];

        if (is_array($available_variations)) {
            foreach ($available_variations as $v) {
                $attrs = $v['attributes'] ?? [];
                if (!is_array($attrs)) continue;

                foreach ($attrs as $attr_key => $attr_val) {
                    $attr_key = (string) $attr_key;
                    $attr_val = (string) $attr_val;

                    if ($attr_key === '' || $attr_val === '') continue;

                    if (!isset($vals_by_key[$attr_key])) $vals_by_key[$attr_key] = [];
                    $vals_by_key[$attr_key][$attr_val] = true;
                }
            }
        }

        foreach ($vals_by_key as $attr_key => $set) {
            $choices = [];
            $values = array_keys($set);

            sort($values, SORT_NATURAL | SORT_FLAG_CASE);

            // attribute_pa_color -> pa_color
            $tax = preg_replace('/^attribute_/', '', (string)$attr_key);

            foreach ($values as $val) {
                $label = $val;

                // If taxonomy attribute, show pretty term name but KEEP value EXACT
                if ($tax && taxonomy_exists($tax)) {
                    $term = get_term_by('slug', $val, $tax);
                    if ($term && !is_wp_error($term)) {
                        $label = $term->name;
                    }
                }

                $choices[] = [
                    'value' => $val,   // EXACT variation value (usually slug)
                    'label' => $label, // pretty label
                ];
            }

            if (!empty($choices)) {
                $groups[] = [
                    'key' => $attr_key,   // e.g. attribute_pa_color
                    'choices' => $choices
                ];
            }
        }

        return $groups;
    }
}

/* ========= Core render ========= */
if (!function_exists('mmb_fbt_render_block')) {
    function mmb_fbt_render_block($product_id = null) {
        if (!function_exists('is_product') || !is_product()) return;

        $product_id = $product_id ? (int)$product_id : (int)get_the_ID();
        if (!$product_id) return;

        $enabled   = get_post_meta($product_id, '_fbt_enabled', true);
        $combo_ids = get_post_meta($product_id, '_fbt_combo_ids', true);

        if ($enabled !== '1' || !is_array($combo_ids) || empty($combo_ids)) return;

        $rules_json = get_post_meta($product_id, '_fbt_discount_rules', true);
        $rules = json_decode((string)$rules_json, true);
        if (!is_array($rules)) $rules = [];

        // Normalize rules (max rate for pill)
        $max_rate = 0;
        foreach ($rules as $r) {
            $rr = isset($r['rate']) ? (float)$r['rate'] : 0;
            if ($rr > $max_rate) $max_rate = $rr;
        }

        $combo_ids = array_unique(array_map('intval', array_merge([$product_id], $combo_ids)));
        $combo_ids = array_values(array_filter($combo_ids));

        $currency = [
            'symbol'       => get_woocommerce_currency_symbol(),
            'position'     => get_option('woocommerce_currency_pos'),
            'decimals'     => wc_get_price_decimals(),
            'decimal_sep'  => wc_get_price_decimal_separator(),
            'thousand_sep' => wc_get_price_thousand_separator(),
        ];

        $block_id = 'mmb-fbt-' . (int)$product_id;

        // prevent duplicate render if hook fires twice
        static $rendered_map = [];
        if (!empty($rendered_map[$block_id])) return;
        $rendered_map[$block_id] = true;

        $qv_nonce = wp_create_nonce('mmb_fbt_qv');
        ?>
        <div id="<?php echo esc_attr($block_id); ?>"
             class="mmb-fbt"
             data-discount-rules="<?php echo esc_attr(wp_json_encode($rules)); ?>"
             data-currency="<?php echo esc_attr(wp_json_encode($currency)); ?>"
             data-qv-nonce="<?php echo esc_attr($qv_nonce); ?>">

            <div class="mmb-fbt__header">
                <div class="mmb-fbt__headLeft">
                    <h3 class="mmb-fbt__title">Frequently Bought Together</h3>
                    <p class="mmb-fbt__sub">Pick what you want. See total instantly. Add the bundle in one tap.</p>
                </div>
                <?php if ($max_rate > 0): ?>
                    <div class="mmb-fbt__pill">Save up to <?php echo esc_html((int)round($max_rate * 100)); ?>%</div>
                <?php endif; ?>
            </div>

            <!-- MOBILE: Thumb strip (JS fill) -->
            <div class="mmb-fbt__stripWrap" aria-hidden="false">
                <div class="mmb-fbt__strip" role="list"></div>
            </div>

            <form class="mmb-fbt__form" onsubmit="return false">
                <div class="mmb-fbt__layout">
                    <div class="mmb-fbt__left">
                        <div class="mmb-fbt__itemsWrap">
                            <div class="mmb-fbt__items">

                                <?php foreach ($combo_ids as $pid):
                                    $p = wc_get_product($pid);
                                    if (!$p) continue;
                                    if (!$p->is_purchasable() || !$p->is_in_stock()) continue;

                                    $link  = get_permalink($pid);
                                    $is_main = ((int)$pid === (int)$product_id);
                                    $needs_custom = fbt_needs_custom_name_by_title($pid);

                                    // Images + dimensions for CLS
                                    $image_id = (int) $p->get_image_id();
                                    $image = '';
                                    $iw = 160; $ih = 160;
                                    if ($image_id) {
                                        $img = wp_get_attachment_image_src($image_id, 'thumbnail');
                                        if (is_array($img) && !empty($img[0])) {
                                            $image = $img[0];
                                            $iw = !empty($img[1]) ? (int)$img[1] : $iw;
                                            $ih = !empty($img[2]) ? (int)$img[2] : $ih;
                                        }
                                    }
                                    if (!$image) $image = wc_placeholder_img_src('thumbnail');

                                    $image_lg = $image_id ? wp_get_attachment_image_url($image_id, 'large') : '';
                                    if (!$image_lg) $image_lg = $image;

                                    // Variations payload
                                    $variations_payload = [];
                                    $attr_groups = [];

                                    if ($p->is_type('variable')) {
                                        $available = $p->get_available_variations();
                                        if (is_array($available)) {
                                            foreach ($available as $v) {
                                                $variations_payload[] = [
                                                    'variation_id'   => $v['variation_id'] ?? 0,
                                                    'attributes'     => $v['attributes'] ?? [],
                                                    'is_in_stock'    => !empty($v['is_in_stock']),
                                                    'is_purchasable' => !empty($v['is_purchasable']),
                                                    'price_html'     => $v['price_html'] ?? '',
                                                    'display_price'  => $v['display_price'] ?? ''
                                                ];
                                            }
                                            $attr_groups = fbt_build_attr_groups_from_variations($p, $available);
                                        }
                                    }
                                    ?>
                                    <div class="mmb-fbt__item fbt-product"
                                         data-product-id="<?php echo esc_attr((int)$pid); ?>"
                                         data-product-name="<?php echo esc_attr(wp_strip_all_tags($p->get_name())); ?>"
                                         data-product-link="<?php echo esc_url($link); ?>"
                                         data-img="<?php echo esc_url($image); ?>"
                                         data-img-large="<?php echo esc_url($image_lg); ?>"
                                         data-is-main="<?php echo $is_main ? '1' : '0'; ?>"
                                         data-needs-custom="<?php echo $needs_custom ? '1' : '0'; ?>"
                                         data-base-price="<?php echo esc_attr((float)$p->get_price()); ?>"
                                         data-variations="<?php echo esc_attr(wp_json_encode($variations_payload)); ?>">

                                        <label class="mmb-fbt__check">
                                            <input type="checkbox" class="fbt-check" checked>
                                            <span></span>
                                        </label>

                                        <div class="mmb-fbt__thumbCol">
                                            <div class="mmb-fbt__thumbWrap">
                                                <a class="mmb-fbt__thumb" href="<?php echo esc_url($link); ?>" target="_blank" rel="noopener">
                                                    <img src="<?php echo esc_url($image); ?>"
                                                         width="<?php echo esc_attr($iw); ?>"
                                                         height="<?php echo esc_attr($ih); ?>"
                                                         alt=""
                                                         loading="lazy"
                                                         decoding="async"
                                                         fetchpriority="low">
                                                </a>
                                            </div>
                                        </div>

                                        <div class="mmb-fbt__meta">
                                            <div class="mmb-fbt__topRow">
                                                <a class="mmb-fbt__name" href="<?php echo esc_url($link); ?>" target="_blank" rel="noopener" title="<?php echo esc_attr(wp_strip_all_tags($p->get_name())); ?>">
                                                    <?php echo esc_html($p->get_name()); ?>
                                                </a>

                                                <div class="mmb-fbt__badges">
                                                    <?php if ($is_main): ?>
                                                        <span class="mmb-fbt__badge mmb-fbt__badge--rec">This Item</span>
                                                    <?php endif; ?>
                                                </div>
                                            </div>

                                            <div class="mmb-fbt__midRow">
                                              <button type="button"
                                                    class="mmb-fbt__eye mmb-fbt__eye--below"
                                                    data-qv="<?php echo esc_attr((int)$pid); ?>"
                                                    aria-label="Quick view">
                                                <img class="mmb-fbt__eyeIcon"
                                                     src="https://img.icons8.com/sf-black-filled/64/visible.png"
                                                     alt=""
                                                     width="14"
                                                     height="14"
                                                     loading="lazy"
                                                     decoding="async" />
                                            </button>
                                                <div class="mmb-fbt__price fbt-price">
                                                    <?php echo wp_kses_post(wc_price((float)$p->get_price())); ?>
                                                </div>
                                                <div class="mmb-fbt__status fbt-status">(Invalid combination or out of stock)</div>
                                            </div>

                                            <?php if (!empty($attr_groups)): ?>
                                              <div class="mmb-fbt__opts">
                                                <?php foreach ($attr_groups as $group):
                                                  $raw_key = (string) ($group['key'] ?? '');
                                                  $tax     = preg_replace('/^attribute_/', '', $raw_key);
                                                  $label   = $tax ? wc_attribute_label($tax) : '';
                                                  if (!$label) {
                                                    $label = ucwords(str_replace(['attribute_', 'pa_', '_', '-'], ['', '', ' ', ' '], $raw_key));
                                                  }
                                                ?>
                                                  <div class="mmb-fbt__opt">
                                                    <span class="mmb-fbt__optLabel"><?php echo esc_html($label); ?></span>
                                                    <select class="mmb-fbt__select"
                                                            data-taxonomy="<?php echo esc_attr($raw_key); ?>"
                                                            data-attr-label="<?php echo esc_attr($label); ?>">
                                                      <?php foreach ($group['choices'] as $ch): ?>
                                                        <option value="<?php echo esc_attr($ch['value']); ?>">
                                                          <?php echo esc_html($ch['label']); ?>
                                                        </option>
                                                      <?php endforeach; ?>
                                                    </select>
                                                  </div>
                                                <?php endforeach; ?>
                                              </div>
                                            <?php endif; ?>

                                            <?php if ($needs_custom): ?>
                                                <div class="mmb-fbt__custom">
                                                    <?php if ($is_main): ?>
                                                        <div class="mmb-fbt__note">
                                                            If your main page has a Custom Name field, we will reuse it. Otherwise enter below.
                                                        </div>
                                                    <?php endif; ?>
                                                    <label class="mmb-fbt__label">
                                                        Custom Name <span>*</span>
                                                    </label>
                                                    <input type="text"
                                                           class="mmb-fbt__input fbt-custom-name"
                                                           placeholder="e.g., Jessica"
                                                           maxlength="30" />
                                                    <div class="mmb-fbt__fine">We print exactly what you enter.</div>
                                                </div>
                                            <?php endif; ?>
                                        </div>
                                    </div>
                                <?php endforeach; ?>

                            </div>
                        </div>
                    </div>

                    <div class="mmb-fbt__right">
                        <div class="mmb-fbt__summary">
                            <div class="mmb-fbt__sumRow">
                                <span>Original</span>
                                <span class="mmb-fbt__origVal">$0.00</span>
                            </div>
                            <div class="mmb-fbt__sumRow mmb-fbt__sumRow--save">
                                <span>You save</span>
                                <span class="mmb-fbt__saveVal">$0.00</span>
                            </div>
                            <div class="mmb-fbt__divider"></div>
                            <div class="mmb-fbt__sumRow mmb-fbt__sumRow--total">
                                <span>Total</span>
                                <span class="mmb-fbt__totalVal">$0.00</span>
                            </div>
                            <div class="mmb-fbt__hint"></div>
                        </div>

                        <button type="button" class="mmb-fbt__cta add-combo-to-cart">
                            <span class="mmb-fbt__spin"></span>
                            <span class="mmb-fbt__ctaTxt">ADD BUNDLE TO CART</span>
                        </button>

                        <div class="mmb-fbt__trust">
                            Secure checkout • Fast processing • Clear total upfront
                        </div>
                    </div>
                </div>

                <!-- kept for backward compatibility, but we won't use it (CSS hides it) -->
                <div class="mmb-fbt__mobileBar" aria-hidden="true"></div>
            </form>
        </div>

        <?php
        // Print CSS once
        static $css_done = false;
        if (!$css_done) {
            $css_done = true;
            ?>
            <style>
                .mmb-fbt{
                    --mmb-bg:#fff;
                    --mmb-card:#fff;
                    --mmb-soft:#f6f7f9;
                    --mmb-border:rgba(0,0,0,.08);
                    --mmb-text:#111827;
                    --mmb-muted:#6b7280;
                    --mmb-accent:#8b0000;
                    --mmb-accent2:#a30000;
                    border:1px solid var(--mmb-border);
                    background:var(--mmb-bg);
                    border-radius:18px;
                    padding:18px;
                    box-shadow:0 10px 30px rgba(0,0,0,.04);
                    margin-top:22px;
                    position:relative;
                }
                .mmb-fbt__header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
                .mmb-fbt__title{margin:0;font-weight:800;font-size:20px;letter-spacing:-.2px;color:var(--mmb-text)}
                .mmb-fbt__sub{margin:6px 0 0;font-size:13px;color:var(--mmb-muted)}
                .mmb-fbt__pill{
                    background:#0b0b0b;color:#fff;
                    border-radius:999px;
                    padding:8px 12px;
                    font-size:12px;
                    font-weight:800;
                    white-space:nowrap;
                }

                /* ===== Mobile thumb strip ===== */
                .mmb-fbt__stripWrap{margin-top:12px}
                .mmb-fbt__strip{
                    display:flex;
                    align-items:flex-start;
                    gap:10px;
                    overflow-x:auto;
                    padding:2px 2px 10px;
                    scrollbar-width:thin;
                }
                .mmb-fbt__strip::-webkit-scrollbar{height:8px}
                .mmb-fbt__strip::-webkit-scrollbar-thumb{background:rgba(0,0,0,.18);border-radius:999px}
                .mmb-fbt__strip::-webkit-scrollbar-track{background:transparent}

                .mmb-fbt__stripPlus{
                    flex:0 0 auto;
                    width:24px;height:24px;
                    border-radius:999px;
                    background:#4b52ff;
                    color:#fff;
                    display:flex;align-items:center;justify-content:center;
                    font-weight:1000;line-height:1;
                    margin-top:34px;
                }

                .mmb-fbt__stripItem{
                    position:relative;
                    flex:0 0 auto;
                    width:92px;
                    height:auto;
                    border-radius:14px;
                    overflow:visible;
                    border:1px solid rgba(0,0,0,.10);
                    background:#fff;
                    display:flex;
                    flex-direction:column;
                    align-items:center;
                    padding:6px;
                    gap:6px;
                }
                .mmb-fbt__stripImg{
                    width:92px;height:92px;
                    border-radius:14px;
                    overflow:hidden;
                    position:relative;
                    border:1px solid rgba(0,0,0,.10);
                    background:#fff;
                }
                .mmb-fbt__stripImg img{width:100%;height:100%;object-fit:cover;display:block}
                .mmb-fbt__stripCheck{
                    position:absolute;left:8px;top:8px;
                    width:22px;height:22px;border-radius:999px;
                    background:rgba(255,255,255,.92);
                    display:flex;align-items:center;justify-content:center;
                    border:1px solid rgba(0,0,0,.10);
                    z-index:2;
                }
                .mmb-fbt__stripCheck:after{
                    content:"";
                    width:10px;height:6px;
                    border-left:2px solid #111;
                    border-bottom:2px solid #111;
                    transform:rotate(-45deg);
                    margin-top:-1px;
                }
                .mmb-fbt__stripItem.is-off{opacity:.45}
                .mmb-fbt__stripItem.is-off .mmb-fbt__stripCheck:after{opacity:.15}

                /* Layout */
                .mmb-fbt__layout{
                    display:grid;
                    grid-template-columns:minmax(0,1fr) 380px;
                    gap:16px;
                    margin-top:14px;
                    align-items:start;
                }

                /* Scroll wrapper */
                .mmb-fbt__itemsWrap{
                    overflow-y:auto;
                    overflow-x:visible;
                }
                .mmb-fbt__itemsWrap::-webkit-scrollbar{width:10px}
                .mmb-fbt__itemsWrap::-webkit-scrollbar-thumb{background:rgba(0,0,0,.18);border-radius:999px}
                .mmb-fbt__itemsWrap::-webkit-scrollbar-track{background:transparent}

                /* Items grid (CLEAN): auto-fit columns, no forced 3-col squeeze */
                .mmb-fbt__items{
                    display:grid;
                    grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));
                    gap:12px;
                }
                @media (min-width: 1024px){
                  .mmb-fbt__items{
                    grid-template-columns: 1fr !important; /* mỗi item 1 hàng */
                  }
                  .mmb-fbt__item{ width:100%; }
                }
                

                /* Card */
                .mmb-fbt__item{
                    border:1px solid var(--mmb-border);
                    background:var(--mmb-card);
                    border-radius:16px;
                    padding:12px;
                    display:grid;
                    grid-template-columns:28px 80px minmax(0,1fr);
                    column-gap:12px;
                    row-gap:8px;
                    align-items:start;
                }

                /* Checkbox */
                .mmb-fbt__check{display:flex;align-items:flex-start;justify-content:center;padding-top:2px}
                .mmb-fbt__check input{position:absolute;opacity:0;pointer-events:none}
                .mmb-fbt__check span{
                    width:22px;height:22px;border-radius:8px;
                    border:1.5px solid rgba(0,0,0,.22);
                    display:inline-flex;align-items:center;justify-content:center;
                    background:#fff;
                }
                .mmb-fbt__check input:checked + span{background:#111;border-color:#111}
                .mmb-fbt__check input:checked + span:after{
                    content:"";
                    width:10px;height:6px;
                    border-left:2px solid #fff;
                    border-bottom:2px solid #fff;
                    transform:rotate(-45deg);
                    margin-top:-1px;
                }

                /* Thumb column (image + eye below) */
                .mmb-fbt__thumbCol{
                    width:80px;
                    display:flex;
                    flex-direction:column;
                    align-items:center;
                    gap:6px;
                }
                .mmb-fbt__thumbWrap{
                    position:relative;
                    width:80px;height:80px;
                    overflow:visible;
                }
                .mmb-fbt__thumb{position:relative;z-index:1;display:block}
                .mmb-fbt__thumb img{
                    width:80px;height:80px;
                    object-fit:cover;
                    border-radius:16px;
                    display:block;
                    border:1px solid rgba(0,0,0,.06);
                }

                /* Eye button: always BELOW image (static) + anti theme invert */
                .mmb-fbt__eye{
                    width:28px;height:28px;
                    padding:0 !important;
                    border-radius:999px;
                    border:1px solid rgba(0,0,0,.12);
                    background:rgba(255,255,255,.92);
                    display:flex;align-items:center;justify-content:center;
                    cursor:pointer;
                    line-height:1;
                    -webkit-appearance:none;
                    appearance:none;

                    position:static !important;
                    inset:auto !important;
                    transform:none !important;
                }
                .mmb-fbt__eye:focus{outline:none;box-shadow:0 0 0 4px rgba(75,82,255,.18)}
                .mmb-fbt__eye img,
                .mmb-fbt__eyeIcon{
                    width:14px !important;
                    height:14px !important;
                    display:block !important;
                    object-fit:contain !important;
                    opacity:1 !important;
                    visibility:visible !important;
                    filter:none !important;
                    -webkit-filter:none !important;
                    mix-blend-mode:normal !important;
                }

                /* Meta */
                .mmb-fbt__meta{min-width:0}
                .mmb-fbt__topRow{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;min-width:0}
                .mmb-fbt__name{
                    font-weight:800;font-size:14px;line-height:1.2;color:var(--mmb-text);
                    text-decoration:none;display:block;min-width:0;
                    white-space:normal;
                    display:-webkit-box;
                    -webkit-line-clamp:2;
                    -webkit-box-orient:vertical;
                    overflow:hidden;
                }
                .mmb-fbt__badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
                .mmb-fbt__badge{
                    font-size:11px;font-weight:800;border-radius:999px;padding:5px 10px;white-space:nowrap;
                    border:1px solid rgba(0,0,0,.08);
                }
                .mmb-fbt__badge--rec{background:#ff6b35;color:#fff;border-color:transparent}
                .mmb-fbt__badge--pers{background:#111;color:#fff;border-color:transparent}

                .mmb-fbt__midRow{margin-top:6px;display:flex;gap:10px;align-items:center;justify-content:space-between;min-width:0}
                .mmb-fbt__price{font-weight:900;color:var(--mmb-text)}
                .mmb-fbt__status{display:none;color:#b91c1c;font-size:12px;font-weight:700}
                .fbt-status{display:none}

                /* ===== FIX: mỗi attribute 1 hàng, label + select cùng hàng ===== */
                .mmb-fbt__opts{
                  margin-top:10px;
                  display:flex;
                  flex-direction:column;   /* 1 attribute = 1 row */
                  gap:10px;
                  min-width:0;
                }
                .mmb-fbt__opt{
                  display:grid;
                  grid-template-columns:92px minmax(0,1fr);
                  align-items:center;
                  gap:10px;
                  min-width:0;
                }
                .mmb-fbt__optLabel{
                  font-size:13px;          /* to lên cho đàng hoàng */
                  font-weight:900;
                  color:var(--mmb-text);
                  white-space:nowrap;
                  line-height:1.1;
                }
                .mmb-fbt__opt .mmb-fbt__select{min-width:0}

                @media (max-width: 420px){
                  .mmb-fbt__opt{grid-template-columns:78px minmax(0,1fr);}
                  .mmb-fbt__optLabel{font-size:12.5px;}
                }

                .mmb-fbt__select{
                    position:relative;
                    z-index:50;
                    height:44px;
                    line-height:44px;
                    padding:0 12px;
                    border-radius:12px;
                    border:1px solid rgba(0,0,0,.12);
                    background:#fff;
                    width:100%;
                    min-width:0;
                }

                .mmb-fbt__custom{
                    margin-top:10px;
                    padding-top:10px;
                    border-top:1px dashed rgba(0,0,0,.12);
                }
                .mmb-fbt__note{font-size:12px;color:var(--mmb-muted);margin-bottom:8px}
                .mmb-fbt__label{font-size:13px;font-weight:900;color:var(--mmb-text);display:block;margin-bottom:6px}
                .mmb-fbt__label span{color:#b91c1c}
                .mmb-fbt__input{
                    width:100%;
                    border:1px solid rgba(0,0,0,.12);
                    border-radius:12px;
                    padding:11px 12px;
                    font-size:13px;
                    background:#fff;
                    outline:none;
                }
                .mmb-fbt__input:focus{border-color:rgba(139,0,0,.45);box-shadow:0 0 0 4px rgba(139,0,0,.08)}
                .mmb-fbt__fine{margin-top:6px;font-size:12px;color:var(--mmb-muted)}

                /* ===== Desktop/tablet: ép layout 2 tầng (Row 1: img+title, Row 2: opts span full) ===== */
                @media (min-width: 768px){
                  /* .mmb-fbt__check{grid-column:1;grid-row:1 / -1;}
                  .mmb-fbt__thumbCol{grid-column:2;grid-row:1 / 3;} */

                  /* Lift children of meta lên grid parent để opts/custom span qua cả cột ảnh */
                  /* .mmb-fbt__meta{display:contents;}

                  .mmb-fbt__topRow{grid-column:3;grid-row:1;min-width:0;}
                  .mmb-fbt__midRow{grid-column:3;grid-row:2;min-width:0;} */

                  /* Attribute + Custom Name xuống hàng dưới, span full (cột 2-3) */
                  /* .mmb-fbt__opts{grid-column:2 / -1;grid-row:3;margin-top:6px;}
                  .mmb-fbt__custom{grid-column:2 / -1;grid-row:4;} */
                  .mmb-fbt__items{
                          grid-template-columns: 1fr !important;
                        }
                }

                /* Right summary */
                .mmb-fbt__summary{
                    border:1px solid var(--mmb-border);
                    border-radius:16px;
                    padding:14px;
                    background:var(--mmb-soft);
                    position:sticky;
                    top:16px;
                }
                .mmb-fbt__sumRow{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--mmb-text);padding:6px 0}
                .mmb-fbt__sumRow--save{color:#0f7a2f;font-weight:900}
                .mmb-fbt__sumRow--total{font-size:16px;font-weight:1000}
                .mmb-fbt__divider{height:1px;background:rgba(0,0,0,.08);margin:8px 0}
                .mmb-fbt__hint{margin-top:8px;font-size:12px;color:var(--mmb-muted)}

                /* CTA */
                .mmb-fbt__cta{
                    width:100%;
                    margin-top:12px;
                    border:none;
                    border-radius:16px;
                    background:var(--mmb-accent);
                    color:#fff;
                    padding:16px 14px;
                    font-weight:1000;
                    letter-spacing:.6px;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    gap:10px;
                    cursor:pointer;
                }
                .mmb-fbt__cta:hover{background:var(--mmb-accent2)}
                .mmb-fbt__cta:disabled{opacity:.7;cursor:not-allowed}
                .mmb-fbt__spin{
                    display:none;
                    width:16px;height:16px;
                    border:2px solid rgba(255,255,255,.8);
                    border-top:2px solid transparent;
                    border-radius:50%;
                    animation:mmbSpin 1s linear infinite;
                }
                @keyframes mmbSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
                .mmb-fbt__trust{margin-top:10px;font-size:12px;color:var(--mmb-muted);text-align:center}

                /* Desktop scroll height */
                @media (min-width: 768px){
                    .mmb-fbt__itemsWrap{
                        max-height:620px;
                        overflow-y:auto;
                        overflow-x:visible;
                        padding-right:6px;
                        position:relative;
                    }
                }

                /* Dropdown no-cut: focus hack */
                .mmb-fbt.mmb-fbt--selecting .mmb-fbt__itemsWrap{
                    overflow:visible !important;
                    max-height:none !important;
                }
                .mmb-fbt.mmb-fbt--selecting .mmb-fbt__items{
                    padding-bottom:220px;
                }

                /* Tablet */
                @media (max-width: 1023px){
                    .mmb-fbt__layout{grid-template-columns:minmax(0,1fr)}
                    .mmb-fbt__summary{position:relative;top:auto}
                    .mmb-fbt__itemsWrap{max-height:unset}
                }

                /* ===== Mobile conversion mode (FIX 28px column bug) ===== */
                @media (max-width: 767px){
                    .mmb-fbt{padding:14px;border-radius:16px}
                    .mmb-fbt__header{flex-direction:column;align-items:flex-start}
                    .mmb-fbt__pill{align-self:flex-start}

                    /* show strip */
                    .mmb-fbt__stripWrap{display:block}

                    /* layout stack */
                    .mmb-fbt__layout{display:block}

                    /* items become list rows */
                    .mmb-fbt__itemsWrap{overflow:visible}
                    .mmb-fbt__items{display:block}

                    /* IMPORTANT: hide thumbCol on mobile (strip already shows thumbs) */
                    .mmb-fbt__thumbCol{display:none !important;}

                    /* ONLY 2 columns in card (check + meta), prevent meta falling into 28px */
                    .mmb-fbt__item{
                        grid-template-columns:28px minmax(0,1fr) !important;
                        gap:10px;
                        padding:12px;
                    }
                    .mmb-fbt__check{grid-column:1/2 !important;}
                    .mmb-fbt__meta{grid-column:2/-1 !important; min-width:0 !important; display:block !important;}

                    .mmb-fbt__badges{display:none}
                    .mmb-fbt__midRow{justify-content:flex-end}
                }

                /* Hide strip on >=768 (mobile only) */
                @media (min-width: 768px){
                    .mmb-fbt__stripWrap{display:none}
                }

                /* We don't use the old mobile bar */
                .mmb-fbt__mobileBar{display:none !important;}

                /* ===== Quick View modal ===== */
                .mmb-fbt__qvModal{display:none;position:fixed;inset:0;z-index:999999}
                .mmb-fbt__qvBackdrop{position:absolute;inset:0;background:rgba(0,0,0,.55)}
                .mmb-fbt__qvPanel{
                    position:absolute;left:50%;top:50%;
                    transform:translate(-50%,-50%);
                    width:min(520px, calc(100vw - 24px));
                    max-height:calc(100vh - 24px);
                    overflow:auto;
                    background:#fff;
                    border-radius:18px;
                    box-shadow:0 30px 80px rgba(0,0,0,.35);
                }
                .mmb-fbt__qvTop{position:relative}
                .mmb-fbt__qvClose{
                    position:absolute;right:10px;top:10px;
                    width:36px;height:36px;border-radius:999px;
                    border:none;background:rgba(0,0,0,.55);color:#fff;
                    font-size:18px;font-weight:1000;cursor:pointer;
                    display:flex;align-items:center;justify-content:center;
                    z-index:3;
                }
                .mmb-fbt__qvImg img{width:100%;height:auto;display:block}
                .mmb-fbt__qvBody{padding:16px}
                .mmb-fbt__qvTitle{margin:0;font-size:17px;font-weight:1000;color:var(--mmb-text)}
                .mmb-fbt__qvPrice{margin-top:6px;font-weight:1000}
                .mmb-fbt__qvOpts{margin-top:12px;display:flex;flex-direction:column;gap:10px}
                .mmb-fbt__qvDone{
                    width:100%;
                    border:none;
                    border-radius:16px;
                    margin-top:14px;
                    background:#111;
                    color:#fff;
                    padding:14px;
                    font-weight:1000;
                    cursor:pointer;
                }

                /* Modal: label/row nhìn cho ra con người */
                #mmbFbtQvModal .mmb-fbt__opt{grid-template-columns:100px minmax(0,1fr);}
                #mmbFbtQvModal .mmb-fbt__optLabel{font-size:13.5px;}
                #mmbFbtQvModal .mmb-fbt__select{height:46px;line-height:46px;border-radius:14px;}

                /* QV thumbs + desc (Option 2) */
                .mmb-fbt__qvThumbs{
                    display:flex;
                    gap:8px;
                    overflow-x:auto;
                    padding:10px 12px 0;
                    scrollbar-width:thin;
                }
                .mmb-fbt__qvThumbs::-webkit-scrollbar{height:8px}
                .mmb-fbt__qvThumbs::-webkit-scrollbar-thumb{background:rgba(0,0,0,.18);border-radius:999px}
                .mmb-fbt__qvThumb{
                    flex:0 0 auto;
                    width:64px;height:64px;
                    border-radius:14px;
                    border:1px solid rgba(0,0,0,.12);
                    overflow:hidden;
                    background:#fff;
                    cursor:pointer;
                    padding:0;
                }
                .mmb-fbt__qvThumb img{width:100%;height:100%;object-fit:cover;display:block}
                .mmb-fbt__qvThumb.is-active{border-color:#111}
                .mmb-fbt__qvDesc{margin-top:10px;font-size:13px;color:#111827;line-height:1.45}
                .mmb-fbt__qvDesc p{margin:0 0 10px}

                /* ===== FBT: show 3 lines title (less ugly than full) ===== */
                .mmb-fbt .mmb-fbt__name{
                    display:-webkit-box !important;
                    -webkit-box-orient:vertical !important;
                    -webkit-line-clamp:3 !important;
                    overflow:hidden !important;
                    white-space:normal !important;
                }
                /* =========================================================
                  DESKTOP/TABLET: Make LEFT items look like MOBILE
                  - Show thumb strip
                  - Items become list rows (no per-item thumbnail column)
                  - Keep RIGHT summary/CTA intact
                  ========================================================= */
                @media (min-width: 768px){

                  /* 1) Show the mobile strip on desktop/tablet */
                  .mmb-fbt__stripWrap{ display:block !important; }

                  /* 2) Make items list style (like mobile) */
                  .mmb-fbt__items{ display:block !important; }

                  /* 3) Hide thumbnail column inside each item (strip already shows images) */
                  .mmb-fbt__thumbCol{ display:none !important; }

                  /* 4) Force item grid to 2 columns: checkbox + content */
                  .mmb-fbt__item{
                    grid-template-columns:28px minmax(0,1fr) !important;
                    gap:10px !important;
                  }

                  /* 5) Disable the desktop "display:contents" trick so layout behaves like mobile */
                  .mmb-fbt__meta{ display:block !important; }

                  /* Reset the desktop grid positioning rules */
                  .mmb-fbt__topRow,
                  .mmb-fbt__midRow,
                  .mmb-fbt__opts,
                  .mmb-fbt__custom{
                    grid-column:auto !important;
                    grid-row:auto !important;
                    margin-top:10px;
                  }

                  /* Optional: hide badges like mobile */
                  .mmb-fbt__badges{ display:none !important; }

                  /* Optional: align price to the right like mobile */
                  .mmb-fbt__midRow{ justify-content:flex-end; }
                }

                /* IMPORTANT: strip is hidden by your existing rule on >=768px,
                  the override above forces it back on. */

            </style>
            <?php
        }
    }
}

/* ========= Hook (default product template) ========= */
add_action('woocommerce_after_single_product_summary', function () {
    mmb_fbt_render_block(get_the_ID());
}, 9);

/* ========= Shortcode (Flatsome UX Builder) ========= */
add_shortcode('mmb_fbt_combo', function ($atts = []) {
    if (!function_exists('is_product') || !is_product()) return '';
    ob_start();
    mmb_fbt_render_block(get_the_ID());
    return ob_get_clean();
});

/* ==== Script xử lý (reload after adding combo) ==== */
add_action('wp_footer', function () {
    if (!function_exists('is_product') || !is_product()) return;

    static $printed = false;
    if ($printed) return;
    $printed = true;
?>
<script>
(function(){
  function boot(){
    if (!window.jQuery || !window.wc_add_to_cart_params) return setTimeout(boot, 50);
    var $ = window.jQuery;

    if (window.__mmbFbtInit === true) return;
    window.__mmbFbtInit = true;

    function slugify(v){
      return (v||'').toString().trim().toLowerCase()
        .replace(/[^a-z0-9]+/g,'-')
        .replace(/^-+|-+$/g,'');
    }

    function getCurrencyCfg($block){
      try { return JSON.parse($block.attr('data-currency') || '{}'); } catch(e){ return {}; }
    }

    function formatMoney(n, C){
      n = parseFloat(n) || 0;
      var decimals = (typeof C.decimals === 'number') ? C.decimals : 2;
      var decSep = C.decimal_sep || '.';
      var thouSep = C.thousand_sep || ',';
      var symbol = C.symbol || '$';
      var pos = C.position || 'left';

      var s = n.toFixed(decimals);
      var parts = s.split('.');
      var i = parts[0];
      var d = parts[1] ? decSep + parts[1] : '';
      i = i.replace(/\B(?=(\d{3})+(?!\d))/g, thouSep);
      var v = i + d;

      switch(pos){
        case 'left_space': return symbol + ' ' + v;
        case 'right': return v + symbol;
        case 'right_space': return v + ' ' + symbol;
        default: return symbol + v;
      }
    }

    function wcAjax(endpoint, data){
      var url = wc_add_to_cart_params.wc_ajax_url.replace('%%endpoint%%', endpoint);
      return $.ajax({ type:'POST', url:url, data:data, dataType:'json' });
    }

    function currentAttrs($w){
      var attrs = {};
      $w.find('select').each(function(){
        var k = $(this).data('taxonomy');
        var v = $(this).val();
        if (k && v) attrs[k] = v;
      });
      return attrs;
    }

    function matchVariation(chosen, candidate){
      var candAttrs = candidate.attributes || {};
      for (var key in candAttrs){
        var want = String(candAttrs[key] || '');
        var got  = String(chosen[key] || '');
        if (want === '') continue;
        if (!got) return false;
        if (got === want) continue;
        if (slugify(got) === slugify(want)) continue;
        return false;
      }
      return true;
    }

    // PERF: cache parsed variations per item
    function getVariationsCached($w){
      var cached = $w.data('mmbVars');
      if (cached) return cached;
      var variations = [];
      try { variations = JSON.parse($w.attr('data-variations') || '[]'); } catch(e){ variations=[]; }
      $w.data('mmbVars', variations);
      return variations;
    }

    function findVariation($w){
      var variations = getVariationsCached($w);
      var attrs = currentAttrs($w);
      if (!variations.length || !Object.keys(attrs).length) return null;

      for (var i=0; i<variations.length; i++){
        var v = variations[i];
        if (matchVariation(attrs, v) && v.is_in_stock && v.is_purchasable) return {v:v, attrs:attrs};
      }
      for (var j=0; j<variations.length; j++){
        var v2 = variations[j];
        if (matchVariation(attrs, v2)) return {v:v2, attrs:attrs};
      }
      return null;
    }

    function refreshPriceBlock($block, $w){
      var C = getCurrencyCfg($block);
      var found = findVariation($w);

      if(found){
        var v = found.v;
        var price = parseFloat(v.display_price) || 0;
        $w.data('price', price);

        if (v.price_html) $w.find('.fbt-price').html(v.price_html);
        else $w.find('.fbt-price').text(formatMoney(price, C));

        if (v.is_in_stock && v.is_purchasable){
          $w.find('.fbt-status').hide();
          $w.find('.fbt-check').prop('disabled', false);
        } else {
          $w.data('price', 0);
          $w.find('.fbt-status').show();
          $w.find('.fbt-check').prop('checked', false).prop('disabled', true);
        }
      } else {
        $w.data('price', 0);
        $w.find('.fbt-price').text('N/A');
        $w.find('.fbt-status').show();
        $w.find('.fbt-check').prop('checked', false).prop('disabled', true);
      }
    }

    function getRules($block){
      try { return JSON.parse($block.attr('data-discount-rules') || '[]') || []; }
      catch(e){ return []; }
    }

    function getDiscountRateByCount(rules, count){
      var rate = 0;
      for (var i=0; i<rules.length; i++){
        var r = rules[i] || {};
        var min = parseInt(r.min, 10);
        var rr  = parseFloat(r.rate);
        if (!min || !rr) continue;
        if (count >= min) rate = rr;
      }
      return rate || 0;
    }

    function getNextTierHint(rules, count){
      rules = (rules || []).slice().sort(function(a,b){
        return (parseInt(a.min,10)||0) - (parseInt(b.min,10)||0);
      });

      var next = null;
      var maxRate = 0;
      for (var i=0; i<rules.length; i++){
        var r = rules[i] || {};
        var min = parseInt(r.min,10)||0;
        var rate = parseFloat(r.rate)||0;
        if (rate > maxRate) maxRate = rate;
        if (!next && min > count) next = {min:min, rate:rate};
      }

      if (next && next.min > count){
        var need = next.min - count;
        return 'Add ' + need + ' more item' + (need>1?'s':'') + ' to unlock ' + Math.round(next.rate*100) + '% off.';
      }
      var current = getDiscountRateByCount(rules, count);
      if (count > 0 && maxRate > 0 && current >= maxRate){
        return 'Best bundle discount unlocked.';
      }
      return '';
    }

    function calcTotals($block){
      var C = getCurrencyCfg($block);
      var sum = 0, count = 0;

      $block.find('.fbt-product').each(function(){
        var $w = $(this);
        if (!$w.find('.fbt-check').is(':checked')) return;
        sum += parseFloat($w.data('price')) || 0;
        count++;
      });

      var rules = getRules($block);
      var rate = getDiscountRateByCount(rules, count);
      var discount = sum * rate;
      var total = Math.max(sum - discount, 0);

      $block.find('.mmb-fbt__origVal').text(formatMoney(sum, C));

      if (discount > 0){
        $block.find('.mmb-fbt__saveVal').text(formatMoney(discount, C) + ' (' + Math.round(rate*100) + '%)');
      } else {
        $block.find('.mmb-fbt__saveVal').text(formatMoney(0, C));
      }

      $block.find('.mmb-fbt__totalVal').text(formatMoney(total, C));

      var hint = getNextTierHint(rules, count);
      $block.find('.mmb-fbt__hint').text(hint || '');
    }

    function initBlock($block){
      if ($block.data('mmbInited')) return;
      $block.data('mmbInited', true);

      $block.find('.fbt-product').each(function(){
        var $w = $(this);
        if ($w.find('select').length){
          refreshPriceBlock($block, $w);
        } else {
          $w.data('price', parseFloat($w.attr('data-base-price')) || 0);
        }
      });

      calcTotals($block);
      buildStrip($block);
      syncStripState($block);
    }

    // PERF: lazy init when entering viewport
    function lazyInitAll(){
      var blocks = $('.mmb-fbt').toArray();
      if (!blocks.length) return;

      if (!('IntersectionObserver' in window)){
        $('.mmb-fbt').each(function(){ initBlock($(this)); });
        return;
      }

      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if (!entry.isIntersecting) return;
          var el = entry.target;
          io.unobserve(el);

          var $block = $(el);
          if ('requestIdleCallback' in window){
            requestIdleCallback(function(){ initBlock($block); }, {timeout: 800});
          } else {
            setTimeout(function(){ initBlock($block); }, 0);
          }
        });
      }, { root: null, threshold: 0.01 });

      blocks.forEach(function(el){ io.observe(el); });
    }

    function ensureInit($block){
      if ($block && !$block.data('mmbInited')) initBlock($block);
    }

    // ===== Strip builder (mobile) =====
    function iconEye(){
      return '<img class="mmb-fbt__eyeIcon" src="https://img.icons8.com/sf-black-filled/64/visible.png" alt="" width="14" height="14" loading="lazy" decoding="async">';
    }

    function buildStrip($block){
      var $strip = $block.find('.mmb-fbt__strip');
      if (!$strip.length) return;

      if ($strip.data('built')) return;
      $strip.data('built', true);

      var html = '';
      var first = true;

      $block.find('.fbt-product').each(function(){
        var $w = $(this);
        var pid = parseInt($w.data('product-id'), 10) || 0;
        if (!pid) return;

        if (!first) html += '<div class="mmb-fbt__stripPlus">+</div>';
        first = false;

        var img = String($w.attr('data-img') || '');
        var checked = $w.find('.fbt-check').is(':checked');
        var offCls = checked ? '' : ' is-off';

        html += ''
          + '<div class="mmb-fbt__stripItem'+offCls+'" role="listitem" data-pid="'+pid+'">'
          +   '<div class="mmb-fbt__stripImg">'
          +     '<img src="'+img+'" alt="" loading="lazy" decoding="async" fetchpriority="low">'
          +     '<div class="mmb-fbt__stripCheck" aria-hidden="true"></div>'
          +   '</div>'
          +   '<button type="button" class="mmb-fbt__eye mmb-fbt__eye--belowStrip" data-qv="'+pid+'" aria-label="Quick view">'
          +      iconEye()
          +   '</button>'
          + '</div>';
      });

      $strip.html(html);
    }

    function syncStripState($block){
      $block.find('.mmb-fbt__stripItem').each(function(){
        var $it = $(this);
        var pid = parseInt($it.data('pid'), 10) || 0;
        if (!pid) return;
        var $w = $block.find('.fbt-product[data-product-id="'+pid+'"]');
        var checked = $w.find('.fbt-check').is(':checked');
        $it.toggleClass('is-off', !checked);
      });
    }

    // ===== Quick View modal (Option 2: AJAX load gallery/desc on click) =====
    function ensureModal(){
      if ($('#mmbFbtQvModal').length) return;

      var modal = ''
        + '<div id="mmbFbtQvModal" class="mmb-fbt__qvModal" aria-hidden="true">'
        +   '<div class="mmb-fbt__qvBackdrop"></div>'
        +   '<div class="mmb-fbt__qvPanel" role="dialog" aria-modal="true">'
        +     '<div class="mmb-fbt__qvTop">'
        +       '<button type="button" class="mmb-fbt__qvClose" aria-label="Close">×</button>'
        +       '<div class="mmb-fbt__qvImg"><img src="" alt=""></div>'
        +       '<div class="mmb-fbt__qvThumbs" role="list"></div>'
        +     '</div>'
        +     '<div class="mmb-fbt__qvBody">'
        +       '<h4 class="mmb-fbt__qvTitle"></h4>'
        +       '<div class="mmb-fbt__qvPrice"></div>'
        +       '<div class="mmb-fbt__qvDesc"></div>'
        +       '<div class="mmb-fbt__qvOpts"></div>'
        +       '<button type="button" class="mmb-fbt__qvDone">Done</button>'
        +     '</div>'
        +   '</div>'
        + '</div>';

      $('body').append(modal);

      $(document).on('click', '#mmbFbtQvModal .mmb-fbt__qvBackdrop, #mmbFbtQvModal .mmb-fbt__qvClose, #mmbFbtQvModal .mmb-fbt__qvDone', function(){
        var $m = $('#mmbFbtQvModal');
        $m.hide().attr('aria-hidden', 'true').data('pid', '');
        window.__mmbQvReq = (window.__mmbQvReq || 0) + 1; // kill pending renders
      });
    }

    window.__mmbQvCache = window.__mmbQvCache || {};
    window.__mmbQvReq = window.__mmbQvReq || 0;

    function fetchQuickViewData($block, pid){
      var nonce = String($block.attr('data-qv-nonce') || '');
      if (!nonce) return $.Deferred().reject('missing_nonce').promise();

      if (window.__mmbQvCache[pid]) {
        return $.Deferred().resolve(window.__mmbQvCache[pid]).promise();
      }

      return wcAjax('mmb_fbt_qv', { product_id: pid, nonce: nonce }).then(function(res){
        if (res && res.success && res.data) {
          window.__mmbQvCache[pid] = res.data;
          return res.data;
        }
        return $.Deferred().reject('bad_response').promise();
      });
    }

    function escAttr(s){
      return String(s || '').replace(/"/g,'&quot;');
    }

    function renderQvGallery($modal, data){
      var images = (data && data.images) ? data.images : [];
      var $thumbs = $modal.find('.mmb-fbt__qvThumbs');
      $thumbs.empty();

      if (images && images.length){
        $modal.find('.mmb-fbt__qvImg img').attr('src', images[0].src || '');

        var html = '';
        for (var i=0; i<images.length; i++){
          var it = images[i] || {};
          var t = it.thumb || it.src || '';
          var f = it.src || t;
          if (!t) continue;

          html += ''
            + '<button type="button" class="mmb-fbt__qvThumb'+(i===0?' is-active':'')+'" data-src="'+escAttr(f)+'" role="listitem" aria-label="Image '+(i+1)+'">'
            +   '<img src="'+escAttr(t)+'" alt="" loading="lazy" decoding="async">'
            + '</button>';
        }
        $thumbs.html(html);
      }
    }

    function openQuickView($block, pid){
      ensureInit($block);
      ensureModal();

      var $w = $block.find('.fbt-product[data-product-id="'+pid+'"]');
      if (!$w.length) return;

      // show immediately with the already-known main image
      var img = String($w.attr('data-img-large') || $w.attr('data-img') || '');
      var title = String($w.data('product-name') || '');
      var priceHtml = $w.find('.fbt-price').html() || '';

      var $modal = $('#mmbFbtQvModal');
      $modal.data('pid', pid);

      $modal.find('.mmb-fbt__qvImg img').attr('src', img);
      $modal.find('.mmb-fbt__qvTitle').text(title);
      $modal.find('.mmb-fbt__qvPrice').html(priceHtml);

      var $opts = $modal.find('.mmb-fbt__qvOpts');
      $opts.empty();

      var $origSelects = $w.find('select.mmb-fbt__select');
      if ($origSelects.length){
        $origSelects.each(function(){
          var $s = $(this);
          var label = String($s.attr('data-attr-label') || $s.data('attr-label') || '');
          var $clone = $s.clone();
          $clone.val($s.val());

          $clone.on('change', function(){
            $s.val($(this).val()).trigger('change');
          });

          var $row = $('<div class="mmb-fbt__opt"></div>');
          if (label) $row.append('<span class="mmb-fbt__optLabel"></span>').find('.mmb-fbt__optLabel').text(label);
          $row.append($clone);

          $opts.append($row);
        });

      }

      var needsCustom = String($w.data('needs-custom')) === '1';
      if (needsCustom){
        var $origInput = $w.find('.fbt-custom-name');
        var val = $origInput.val() || '';
        var block = ''
          + '<div class="mmb-fbt__custom" style="margin-top:8px;border-top:1px dashed rgba(0,0,0,.12);padding-top:10px">'
          +   '<label class="mmb-fbt__label">Custom Name <span>*</span></label>'
          +   '<input type="text" class="mmb-fbt__input mmb-fbt__qvName" maxlength="30" placeholder="e.g., Jessica" />'
          +   '<div class="mmb-fbt__fine">We print exactly what you enter.</div>'
          + '</div>';
        $opts.append(block);
        $opts.find('.mmb-fbt__qvName').val(val).on('input', function(){
          $origInput.val($(this).val());
        });
      }

      // reset ajax-loaded parts
      $modal.find('.mmb-fbt__qvThumbs').empty();
      $modal.find('.mmb-fbt__qvDesc').html('');

      // open modal now
      $modal.show().attr('aria-hidden', 'false');

      // AJAX load gallery + desc (Option 2)
      var reqId = ++window.__mmbQvReq;
      fetchQuickViewData($block, pid).then(function(data){
        if (reqId !== window.__mmbQvReq) return;
        if (parseInt($modal.data('pid'),10) !== pid) return;
        if (!$modal.is(':visible')) return;

        if (data && data.title) $modal.find('.mmb-fbt__qvTitle').text(data.title);
        $modal.find('.mmb-fbt__qvDesc').html(data.short_description || '');

        renderQvGallery($modal, data);
      }).catch(function(){
        // fail => keep fallback main image, no drama
      });
    }

    // Events
    $(document).off('change.mmbFbt', '.mmb-fbt .fbt-product select')
      .on('change.mmbFbt', '.mmb-fbt .fbt-product select', function(){
        var $block = $(this).closest('.mmb-fbt');
        ensureInit($block);
        var $w = $(this).closest('.fbt-product');
        refreshPriceBlock($block, $w);
        calcTotals($block);
      });

    $(document).off('change.mmbFbt', '.mmb-fbt .fbt-check')
      .on('change.mmbFbt', '.mmb-fbt .fbt-check', function(){
        var $block = $(this).closest('.mmb-fbt');
        ensureInit($block);
        calcTotals($block);
        syncStripState($block);
      });

    // Quick view click (strip + desktop card)
    $(document).off('click.mmbFbtQv', '.mmb-fbt .mmb-fbt__eye')
      .on('click.mmbFbtQv', '.mmb-fbt .mmb-fbt__eye', function(e){
        e.preventDefault();
        e.stopPropagation();
        var $block = $(this).closest('.mmb-fbt');
        var pid = parseInt($(this).attr('data-qv'), 10) || 0;
        if (!pid) return;
        openQuickView($block, pid);
      });

    // QV thumbnail click => swap main image
    $(document).off('click.mmbFbtQvThumb', '#mmbFbtQvModal .mmb-fbt__qvThumb')
      .on('click.mmbFbtQvThumb', '#mmbFbtQvModal .mmb-fbt__qvThumb', function(e){
        e.preventDefault();
        var $btn = $(this);
        var src = String($btn.attr('data-src') || '');
        if (!src) return;

        var $modal = $('#mmbFbtQvModal');
        $modal.find('.mmb-fbt__qvImg img').attr('src', src);
        $modal.find('.mmb-fbt__qvThumb').removeClass('is-active');
        $btn.addClass('is-active');
      });

    // Dropdown no-cut: focus hack
    $(document)
      .off('focusin.mmbFbtSelect')
      .on('focusin.mmbFbtSelect', '.mmb-fbt .mmb-fbt__select', function(){
        $(this).closest('.mmb-fbt').addClass('mmb-fbt--selecting');
      });

    $(document)
      .off('focusout.mmbFbtSelect')
      .on('focusout.mmbFbtSelect', '.mmb-fbt .mmb-fbt__select', function(){
        var $b = $(this).closest('.mmb-fbt');
        setTimeout(function(){ $b.removeClass('mmb-fbt--selecting'); }, 150);
      });

    function addSimple(pid, fbtCustomName){
      var data = { product_id: pid, quantity: 1, combo_source: 'combo_upsell' };
      if (fbtCustomName) data.fbt_custom_name = fbtCustomName;
      return wcAjax('add_to_cart', data);
    }

    // HARD FIX: add VARIATION itself as product_id
    function addVariable(parentPid, variation, chosenAttrs, fbtCustomName){
      var vid = parseInt(variation.variation_id, 10) || 0;

      var data = {
        product_id: vid,
        quantity: 1,
        combo_source: 'combo_upsell',
        variation_id: vid,
        parent_product_id: parentPid
      };

      if (chosenAttrs && typeof chosenAttrs === 'object'){
        for (var k in chosenAttrs){
          if (!chosenAttrs.hasOwnProperty(k)) continue;
          data[k] = chosenAttrs[k];
        }
      }

      if (fbtCustomName) data.fbt_custom_name = fbtCustomName;

      return wcAjax('add_to_cart', data);
    }

    window.__mmbFbtAdding = window.__mmbFbtAdding || false;

    function getExistingProductPageName(){
      var v = $('input[name="custom_name"]').first().val();
      return (v || '').toString().trim();
    }

    $(document).off('click.mmbFbt', '.mmb-fbt .add-combo-to-cart')
      .on('click.mmbFbt', '.mmb-fbt .add-combo-to-cart', async function(e){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (window.__mmbFbtAdding) return;
        window.__mmbFbtAdding = true;

        var $btn = $(this);
        var $block = $btn.closest('.mmb-fbt');
        ensureInit($block);

        $btn.prop('disabled', true);
        $btn.find('.mmb-fbt__spin').show();
        $btn.find('.mmb-fbt__ctaTxt').text('ADDING...');

        var successCount = 0;

        try{
          var items = [];

          $block.find('.fbt-product').each(function(){
            var $w = $(this);
            if (!$w.find('.fbt-check').is(':checked')) return;

            var pid = parseInt($w.data('product-id'), 10);
            if (!pid) return;

            var pname = String($w.data('product-name') || '');
            var needsCustom = String($w.data('needs-custom')) === '1';
            var isMain = String($w.data('is-main')) === '1';

            var fbtCustomName = '';
            if (needsCustom){
              fbtCustomName = String($w.find('.fbt-custom-name').val() || '').trim();
              if (!fbtCustomName && isMain) fbtCustomName = getExistingProductPageName();
              if (!fbtCustomName){
                alert('Custom Name is required for: ' + pname);
                throw new Error('Missing fbt_custom_name for ' + pid);
              }
            }

            if ($w.find('select').length){
              var found = findVariation($w);
              if (found && found.v && found.v.variation_id && found.v.is_in_stock){
                items.push({ type:'variable', pid: pid, variation: found.v, chosenAttrs: found.attrs || {}, fbtCustomName: fbtCustomName });
              } else {
                alert('Please select a valid variation for: ' + pname);
                throw new Error('Invalid variation for ' + pid);
              }
            } else {
              items.push({ type:'simple', pid: pid, fbtCustomName: fbtCustomName });
            }
          });

          if (!items.length){
            alert('No valid products to add.');
            return;
          }

          for (var i=0; i<items.length; i++){
            var it = items[i];
            if (it.type === 'simple'){
              await addSimple(it.pid, it.fbtCustomName);
              successCount++;
            } else {
              await addVariable(it.pid, it.variation, it.chosenAttrs, it.fbtCustomName);
              successCount++;
            }
          }

          if (successCount > 0){
            window.location.reload();
            return;
          }
        } catch(err){
          console.error(err);
          if (!String(err && err.message || '').includes('Missing fbt_custom_name')){
            alert('Error adding products to cart.');
          }
        } finally {
          $btn.prop('disabled', false);
          $btn.find('.mmb-fbt__spin').hide();
          $btn.find('.mmb-fbt__ctaTxt').text('ADD BUNDLE TO CART');
          window.__mmbFbtAdding = false;
        }
      });

    // Start
    lazyInitAll();
    $('.mmb-fbt').each(function(){
      // strip build early (lightweight)
      buildStrip($(this));
    });
  }
  boot();
})();
</script>
<?php }, 999);

/* ==== Enqueue scripts needed ==== */
add_action('wp_enqueue_scripts', function () {
    if (function_exists('is_product') && is_product()) {
        wp_enqueue_script('jquery');
        wp_enqueue_script('woocommerce');
        wp_enqueue_script('wc-add-to-cart-variation');
        wp_enqueue_script('wc-cart-fragments');
    }
});

/* ========= Quick View AJAX (Option 2) ========= */
add_action('wc_ajax_mmb_fbt_qv', 'mmb_fbt_qv_ajax');
add_action('wc_ajax_nopriv_mmb_fbt_qv', 'mmb_fbt_qv_ajax');

function mmb_fbt_qv_ajax() {
    $nonce = isset($_POST['nonce']) ? sanitize_text_field(wp_unslash($_POST['nonce'])) : '';
    if (!$nonce || !wp_verify_nonce($nonce, 'mmb_fbt_qv')) {
        wp_send_json_error(['message' => 'Invalid nonce'], 403);
    }

    $pid = isset($_POST['product_id']) ? absint($_POST['product_id']) : 0;
    if (!$pid) {
        wp_send_json_error(['message' => 'Missing product_id'], 400);
    }

    // If variation clicked => use parent for gallery/desc
    $parent_id = wp_get_post_parent_id($pid);
    $product   = wc_get_product($parent_id ?: $pid);
    if (!$product) {
        wp_send_json_error(['message' => 'Product not found'], 404);
    }

    // images: featured + gallery
    $img_ids = [];
    $main_id = (int) $product->get_image_id();
    if ($main_id) $img_ids[] = $main_id;

    $gallery_ids = $product->get_gallery_image_ids();
    if (is_array($gallery_ids) && $gallery_ids) {
        $img_ids = array_merge($img_ids, $gallery_ids);
    }

    $img_ids = array_values(array_unique(array_filter(array_map('intval', $img_ids))));

    $images = [];
    foreach ($img_ids as $aid) {
        $full = wp_get_attachment_image_src($aid, 'large');
        if (!$full || empty($full[0])) continue;

        $thumb = wp_get_attachment_image_src($aid, 'thumbnail');
        $images[] = [
            'src'   => $full[0],
            'w'     => isset($full[1]) ? (int)$full[1] : 0,
            'h'     => isset($full[2]) ? (int)$full[2] : 0,
            'thumb' => (!empty($thumb[0]) ? $thumb[0] : $full[0]),
        ];
    }

    if (empty($images)) {
        $images[] = [
            'src'   => wc_placeholder_img_src('large'),
            'w'     => 0,
            'h'     => 0,
            'thumb' => wc_placeholder_img_src('thumbnail'),
        ];
    }

    $desc = (string) $product->get_short_description();
    if (!$desc) {
        $desc = wp_trim_words(wp_strip_all_tags((string)$product->get_description()), 50);
    }

    wp_send_json_success([
        'product_id'        => (int) $product->get_id(),
        'title'             => wp_strip_all_tags($product->get_name()),
        'permalink'         => get_permalink($product->get_id()),
        'images'            => $images,
        'short_description' => wp_kses_post($desc),
    ]);
}

/**
 * Server-side combo guard:
 * - Only applies to combo requests (combo_source=combo_upsell)
 * - Require fbt_custom_name for personalized items
 * - Deduplicate per (product + variation + fbt_custom_name) within 2 seconds
 */
add_filter('woocommerce_add_to_cart_validation', function($passed, $product_id, $quantity, $variation_id = 0, $variations = []) {

    if (!function_exists('WC') || !WC()->session) return $passed;

    $is_combo = (!empty($_POST['combo_source']) && $_POST['combo_source'] === 'combo_upsell');
    if (!$is_combo) return $passed;

    $product_id   = (int) $product_id;
    $variation_id = (int) $variation_id;

    // HARD FIX: when adding variation as product_id, Woo may pass $variation_id=0
    if (isset($_POST['variation_id'])) {
        $variation_id = (int) $_POST['variation_id'];
    }

    $now = time();

    $fbt_custom_name = isset($_POST['fbt_custom_name']) ? sanitize_text_field(wp_unslash($_POST['fbt_custom_name'])) : '';

    if (fbt_needs_custom_name_by_title($product_id)) {
        if ($fbt_custom_name === '') {
            wc_add_notice('This item requires a Custom Name. Please enter it before adding.', 'error');
            return false;
        }
        if (mb_strlen($fbt_custom_name) > 30) {
            wc_add_notice('Custom Name is too long (max 30 characters).', 'error');
            return false;
        }
    }

    $dedupe_key = 'combo_last_add_' . (int)$product_id . '_' . (int)$variation_id . '_' . md5((string)$fbt_custom_name);
    $last = (int) WC()->session->get($dedupe_key);
    if ($last && ($now - $last) <= 2) return false;

    WC()->session->set($dedupe_key, $now);
    return $passed;
}, 10, 5);

add_filter('woocommerce_add_cart_item_data', function($cart_item_data, $product_id, $variation_id) {

    $is_combo = (!empty($_POST['combo_source']) && $_POST['combo_source'] === 'combo_upsell');
    if (!$is_combo) return $cart_item_data;

    $product_id   = (int) $product_id;
    $variation_id = (int) $variation_id;

    if (isset($_POST['variation_id'])) {
        $variation_id = (int) $_POST['variation_id'];
    }

    $cart_item_data['combo_source'] = 'combo_upsell';

    $fbt_custom_name = isset($_POST['fbt_custom_name']) ? sanitize_text_field(wp_unslash($_POST['fbt_custom_name'])) : '';

    if (fbt_needs_custom_name_by_title($product_id) && $fbt_custom_name !== '') {
        $cart_item_data['fbt_custom_name'] = $fbt_custom_name;

        // prevent merge across different custom names
        $cart_item_data['unique_key'] = md5($product_id . '|' . $variation_id . '|' . $fbt_custom_name . '|' . microtime(true));
    }

    return $cart_item_data;
}, 10, 3);

/**
 * Clean duplicate "Custom Name" lines for combo items and display only 1 line (from fbt_custom_name)
 */
add_filter('woocommerce_get_item_data', function($item_data, $cart_item) {

    if (empty($cart_item['combo_source']) || $cart_item['combo_source'] !== 'combo_upsell') {
        return $item_data;
    }

    // Remove any existing "Custom Name" lines added by other snippets/plugins
    $clean = [];
    foreach ((array)$item_data as $row) {
        $k = isset($row['key']) ? (string)$row['key'] : '';
        if (strcasecmp(trim($k), 'Custom Name') === 0) continue;
        $clean[] = $row;
    }
    $item_data = $clean;

    // Add our single, correct line
    if (!empty($cart_item['fbt_custom_name'])) {
        $item_data[] = [
            'key'   => 'Custom Name',
            'value' => wc_clean($cart_item['fbt_custom_name']),
        ];
    }

    return $item_data;
}, 99, 2);

add_action('woocommerce_checkout_create_order_line_item', function($item, $cart_item_key, $values, $order) {

    if (empty($values['combo_source']) || $values['combo_source'] !== 'combo_upsell') {
        return;
    }

    if (!empty($values['fbt_custom_name'])) {
        $item->delete_meta_data('Custom Name');
        $item->add_meta_data('Custom Name', $values['fbt_custom_name'], true);
    }

}, 99, 4);

/**
 * Force mini-cart to display cart TOTAL (after fees/discount), not subtotal.
 */
add_filter('woocommerce_widget_cart_totals', function($output) {
    if (!function_exists('WC') || !WC()->cart) return $output;

    WC()->cart->calculate_totals();
    $total_html = WC()->cart->get_total();

    $output = preg_replace(
        '/<strong class="woocommerce-mini-cart__total total">.*?<\/strong>.*?<span class="woocommerce-Price-amount.*?<\/span>/s',
        '<strong class="woocommerce-mini-cart__total total">' . esc_html__('Total', 'woocommerce') . '</strong> ' . $total_html,
        $output
    );

    return $output;
}, 999);
