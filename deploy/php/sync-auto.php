<?php
header('Content-Type: text/plain; charset=utf-8');
$b = 'https://raw.githubusercontent.com/kissforg188-netizen/moovie/cursor/bc-77a70e80-e883-46f0-b08f-691fd9c5f36a-1a67/deploy/php/';
$fs = [
  'lib/automation.php','lib/adapters.php','lib/app.php','lib/install.php',
  'api.php','index.php','install.php','assets/app.css','assets/app.js',
  'samples/products.sample.json','samples/products.sample.csv','.htaccess',
];
$o = 0;
foreach ($fs as $f) {
  $u = $b . implode('/', array_map('rawurlencode', explode('/', $f)));
  $ch = curl_init($u);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => 1, CURLOPT_FOLLOWLOCATION => 1, CURLOPT_TIMEOUT => 90, CURLOPT_SSL_VERIFYPEER => 0]);
  $d = curl_exec($ch);
  $c = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($c >= 400 || $d === false || $d === '') { echo "FAIL $f\n"; continue; }
  $t = __DIR__ . '/' . $f;
  $dir = dirname($t);
  if (!is_dir($dir)) mkdir($dir, 0755, true);
  file_put_contents($t, $d);
  echo "OK $f " . strlen($d) . "\n";
  $o++;
}
echo "DONE $o/" . count($fs) . "\n";
