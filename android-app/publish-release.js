// Publica una nueva version del APK compilado: lo sube a Supabase Storage
// y actualiza las 3 keys en `settings` que /api/app-version expone.
//
// Uso (desde la carpeta android-app/, con las env vars de ../.env.local):
//   node publish-release.js <versionCode> <versionName> [ruta-al-apk]
//
// Ejemplo:
//   node publish-release.js 2 1.0.1
//   (usa por defecto app/build/outputs/apk/release/app-release.apk)

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const text = fs.readFileSync(envPath, 'utf8');
  const env = {};
  text.split('\n').forEach(line => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  });
  return env;
}

async function main() {
  const [versionCode, versionName, apkPathArg] = process.argv.slice(2);
  if (!versionCode || !versionName) {
    console.error('Uso: node publish-release.js <versionCode> <versionName> [ruta-al-apk]');
    process.exit(1);
  }

  const apkPath = apkPathArg || path.join(__dirname, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (!fs.existsSync(apkPath)) {
    console.error(`No se encontro el APK en: ${apkPath}`);
    process.exit(1);
  }

  const env = loadEnvLocal();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const fileBuffer = fs.readFileSync(apkPath);
  const storagePath = `android-app/inkora-app-v${versionCode}.apk`;

  console.log(`Subiendo ${apkPath} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB) -> ${storagePath} ...`);

  const { error: uploadError } = await supabase.storage
    .from('assets')
    .upload(storagePath, fileBuffer, {
      contentType: 'application/vnd.android.package-archive',
      upsert: true,
    });

  if (uploadError) {
    console.error('Error subiendo el APK:', uploadError.message);
    process.exit(1);
  }

  const { data: publicData } = supabase.storage.from('assets').getPublicUrl(storagePath);

  const rows = [
    { key: 'android_app_version_code', value: String(versionCode) },
    { key: 'android_app_version_name', value: versionName },
    { key: 'android_app_apk_url', value: publicData.publicUrl },
  ];

  const { error: settingsError } = await supabase.from('settings').upsert(rows, { onConflict: 'key' });
  if (settingsError) {
    console.error('Error actualizando settings:', settingsError.message);
    process.exit(1);
  }

  console.log(`Version ${versionName} (code ${versionCode}) publicada.`);
  console.log(`URL: ${publicData.publicUrl}`);
}

main();
