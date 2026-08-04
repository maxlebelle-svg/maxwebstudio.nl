function cleanText(value = "") {
  return String(value || "").trim();
}

function cleanPath(value = "") {
  return cleanText(value).replace(/^\.?\//, "").split("?")[0].split("#")[0];
}

function safePublicDemoAssetMap(generatedPackage = {}) {
  const meta = generatedPackage?.meta && typeof generatedPackage.meta === "object" ? generatedPackage.meta : {};
  const assets = [meta.heroImage, ...Object.values(meta.demoImageAssets || {})];
  const map = new Map();
  for (const asset of assets) {
    const packagedPath = cleanPath(asset?.src);
    const publicPath = cleanText(asset?.originalSrc);
    if (!packagedPath || !/^\/assets\/demo-images\/[a-z0-9/_.,+() -]+$/i.test(publicPath)) continue;
    map.set(packagedPath, publicPath);
  }
  return map;
}

function compactFactoryPreviewPackage(generatedPackage = {}) {
  const files = Array.isArray(generatedPackage?.files) ? generatedPackage.files : [];
  const publicAssets = safePublicDemoAssetMap(generatedPackage);
  if (!publicAssets.size) return generatedPackage;
  const compactFiles = files.filter((file) => !publicAssets.has(cleanPath(file?.path)));
  const removedAssetCount = files.length - compactFiles.length;
  if (!removedAssetCount) return generatedPackage;
  return {
    ...generatedPackage,
    files: compactFiles,
    meta: {
      ...(generatedPackage.meta || {}),
      previewStorage: {
        ...(generatedPackage.meta?.previewStorage || {}),
        mode: "compact_public_demo_assets",
        fullPackageSource: "website_build_jobs",
        removedAssetCount,
      },
    },
  };
}

module.exports = { compactFactoryPreviewPackage, safePublicDemoAssetMap };
