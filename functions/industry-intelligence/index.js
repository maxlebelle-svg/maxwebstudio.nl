"use strict";

const { adaptIndustryProfileToFactoryInput } = require("./adapter");
const { buildIndustryProfile } = require("./engine");
const { selectPhotoAssetGroup } = require("./photo-selection-policy");
const { SCHEMA_VERSION } = require("./schema");

module.exports = { SCHEMA_VERSION, adaptIndustryProfileToFactoryInput, buildIndustryProfile, selectPhotoAssetGroup };
