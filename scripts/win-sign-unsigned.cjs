'use strict';

module.exports = async function unsignedDevelopmentBuild(configuration) {
  const file = configuration?.path || 'unknown';
  console.log(`[UnsignedBuild] Authenticode skipped for development artifact: ${file}`);
};
