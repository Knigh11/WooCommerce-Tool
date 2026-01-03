<?php
/*
Plugin Name: MMB Offers Engine
Description: FBT Combo Upsell + Buy More Save More (BMSM) for WooCommerce.
Version: 1.0.0
Author: Con ca cha bac
*/

if (!defined('ABSPATH')) exit;

add_action('plugins_loaded', function () {
  if (!class_exists('WooCommerce')) return;

  require_once __DIR__ . '/includes/bmsm_api.php';
  require_once __DIR__ . '/includes/upsale_API.php';
  require_once __DIR__ . '/includes/show_bmsm.php';
  require_once __DIR__ . '/includes/Show_Upsale_Product.php';

});
