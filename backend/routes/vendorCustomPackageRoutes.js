const express = require('express');
const mongoose = require('mongoose');

const VendorCustomPackage = require('../models/VendorCustomPackage');
const {
  buildVendorCustomPackageTree,
  createVendorCustomPackageNode,
  listVendorCustomPackageNodes,
  normalizeCustomType,
  normalizeVariantMode,
} = require('../services/vendorCustomPackageService');
const {
  requireVendorBodyWriteAccess,
  requireVendorWriteAccess,
} = require('../utils/vendorWriteAuth');
const {
  applyOfferDateFields,
  isOfferCurrentlyValid,
  offerDateToYmd,
  validateOfferDateRange,
} = require('../utils/offerValidity');

const router = express.Router();

function toObjectId(value, fieldName) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    const error = new Error(`Invalid ${fieldName}`);
    error.status = 400;
    throw error;
  }
  return new mongoose.Types.ObjectId(value);
}

function isOffersLabel(value) {
  return String(value || '').trim().toLowerCase() === 'offers';
}

function isOfferNode(node) {
  return normalizeCustomType(node?.customType) === 'offer' ||
    isOffersLabel(node?.name) ||
    (Array.isArray(node?.pathLabels) && node.pathLabels.some(isOffersLabel));
}

function filterPublicOfferNodes(nodes = []) {
  return nodes
    .filter((node) => !isOfferNode(node) || isOfferCurrentlyValid(node))
    .map((node) => ({
      ...node,
      children: Array.isArray(node.children) ? filterPublicOfferNodes(node.children) : node.children,
    }));
}

function serializeCustomPackageDates(node) {
  if (!node || typeof node !== 'object') return node;
  const next = {
    ...node,
    offerStartDate: offerDateToYmd(node.offerStartDate),
    offerEndDate: offerDateToYmd(node.offerEndDate),
  };
  if (Array.isArray(next.children)) {
    next.children = next.children.map(serializeCustomPackageDates);
  }
  return next;
}

router.get('/', async (req, res) => {
  try {
    const { vendorId, rootCategoryId, format = 'tree', includeDeleted = 'false' } = req.query;

    if (!vendorId || !rootCategoryId) {
      return res.status(400).json({
        success: false,
        message: 'vendorId and rootCategoryId are required',
      });
    }

    const params = {
      vendorId: toObjectId(vendorId, 'vendorId'),
      rootCategoryId: toObjectId(rootCategoryId, 'rootCategoryId'),
      includeDeleted: includeDeleted === 'true',
    };

    const rawData =
      format === 'flat'
        ? await listVendorCustomPackageNodes(params)
        : await buildVendorCustomPackageTree(params);
    const publicMode = req.query.mode === 'user' || req.query.public === 'true';
    const filteredData = publicMode ? filterPublicOfferNodes(rawData) : rawData;
    const data = filteredData.map(serializeCustomPackageDates);

    return res.json({
      success: true,
      data,
      format: format === 'flat' ? 'flat' : 'tree',
    });
  } catch (error) {
    console.error('GET /vendor-custom-packages error:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to fetch vendor custom packages',
    });
  }
});

router.post('/', requireVendorBodyWriteAccess(), async (req, res) => {
  try {
    const created = await createVendorCustomPackageNode(req.body || {});
    return res.status(201).json({
      success: true,
      message: 'Custom package created',
      data: created,
    });
  } catch (error) {
    console.error('POST /vendor-custom-packages error:', error);
    return res.status(error.status || 400).json({
      success: false,
      message: error.message || 'Failed to create vendor custom package',
    });
  }
});

router.put('/reorder', requireVendorBodyWriteAccess(), async (req, res) => {
  try {
    const { vendorId, rootCategoryId, parentNodeId = null, parentNodeType = 'root', items = [] } = req.body || {};

    if (!vendorId || !rootCategoryId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'vendorId, rootCategoryId and non-empty items array are required',
      });
    }

    const vendorObjectId = toObjectId(vendorId, 'vendorId');
    const rootCategoryObjectId = toObjectId(rootCategoryId, 'rootCategoryId');
    const normalizedParentId =
      parentNodeType === 'root' || !parentNodeId ? null : toObjectId(parentNodeId, 'parentNodeId');

    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: {
          _id: toObjectId(item.id, 'id'),
          vendorId: vendorObjectId,
          rootCategoryId: rootCategoryObjectId,
          isDeleted: false,
          parentNodeType,
          parentNodeId: normalizedParentId,
        },
        update: {
          $set: { sequence: Number(item.sequence) || 0 },
        },
      },
    }));

    if (bulkOps.length) {
      await VendorCustomPackage.bulkWrite(bulkOps);
    }

    return res.json({
      success: true,
      message: 'Custom package order updated',
    });
  } catch (error) {
    console.error('PUT /vendor-custom-packages/reorder error:', error);
    return res.status(error.status || 400).json({
      success: false,
      message: error.message || 'Failed to reorder vendor custom packages',
    });
  }
});

router.put('/:id/status', requireVendorBodyWriteAccess(), async (req, res) => {
  try {
    const { vendorId, rootCategoryId, pricingStatus } = req.body || {};

    if (!vendorId || !rootCategoryId || !pricingStatus) {
      return res.status(400).json({
        success: false,
        message: 'vendorId, rootCategoryId and pricingStatus are required',
      });
    }

    if (!['Active', 'Inactive'].includes(pricingStatus)) {
      return res.status(400).json({
        success: false,
        message: 'pricingStatus must be Active or Inactive',
      });
    }

    const nodeId = toObjectId(req.params.id, 'id');
    const vendorObjectId = toObjectId(vendorId, 'vendorId');
    const rootCategoryObjectId = toObjectId(rootCategoryId, 'rootCategoryId');

    const node = await VendorCustomPackage.findOne({
      _id: nodeId,
      vendorId: vendorObjectId,
      rootCategoryId: rootCategoryObjectId,
      isDeleted: false,
    }).lean();

    if (!node) {
      return res.status(404).json({
        success: false,
        message: 'Custom package not found',
      });
    }

    const descendantIds = await VendorCustomPackage.find({
      vendorId: vendorObjectId,
      rootCategoryId: rootCategoryObjectId,
      isDeleted: false,
      ancestorNodeIds: nodeId,
    }).distinct('_id');

    const idsToUpdate = [nodeId, ...descendantIds];

    await VendorCustomPackage.updateMany(
      {
        _id: { $in: idsToUpdate },
        vendorId: vendorObjectId,
        rootCategoryId: rootCategoryObjectId,
        isDeleted: false,
      },
      {
        $set: {
          pricingStatus,
        },
      }
    );

    return res.json({
      success: true,
      message: `Custom package marked ${pricingStatus.toLowerCase()}`,
      updatedCount: idsToUpdate.length,
    });
  } catch (error) {
    console.error('PUT /vendor-custom-packages/:id/status error:', error);
    return res.status(error.status || 400).json({
      success: false,
      message: error.message || 'Failed to update vendor custom package status',
    });
  }
});

router.post('/:id/restore', requireVendorBodyWriteAccess(), async (req, res) => {
  try {
    const { vendorId, rootCategoryId, pricingStatus = 'Active' } = req.body || {};

    if (!vendorId || !rootCategoryId) {
      return res.status(400).json({
        success: false,
        message: 'vendorId and rootCategoryId are required',
      });
    }

    const nodeId = toObjectId(req.params.id, 'id');
    const vendorObjectId = toObjectId(vendorId, 'vendorId');
    const rootCategoryObjectId = toObjectId(rootCategoryId, 'rootCategoryId');

    const node = await VendorCustomPackage.findOne({
      _id: nodeId,
      vendorId: vendorObjectId,
      rootCategoryId: rootCategoryObjectId,
    }).lean();

    if (!node) {
      return res.status(404).json({
        success: false,
        message: 'Custom package not found',
      });
    }

    const descendantIds = await VendorCustomPackage.find({
      vendorId: vendorObjectId,
      rootCategoryId: rootCategoryObjectId,
      ancestorNodeIds: nodeId,
    }).distinct('_id');

    const idsToRestore = [nodeId, ...descendantIds];

    await VendorCustomPackage.updateMany(
      {
        _id: { $in: idsToRestore },
        vendorId: vendorObjectId,
        rootCategoryId: rootCategoryObjectId,
      },
      {
        $set: {
          isDeleted: false,
          deletedAt: null,
          pricingStatus,
        },
      }
    );

    return res.json({
      success: true,
      message: 'Custom package restored',
      restoredCount: idsToRestore.length,
    });
  } catch (error) {
    console.error('POST /vendor-custom-packages/:id/restore error:', error);
    return res.status(error.status || 400).json({
      success: false,
      message: error.message || 'Failed to restore vendor custom package',
    });
  }
});

router.put('/:id', requireVendorBodyWriteAccess(), async (req, res) => {
  try {
    const { vendorId, rootCategoryId, ...updates } = req.body || {};
    if (!vendorId || !rootCategoryId) {
      return res.status(400).json({
        success: false,
        message: 'vendorId and rootCategoryId are required',
      });
    }

    const nodeId = toObjectId(req.params.id, 'id');
    const vendorObjectId = toObjectId(vendorId, 'vendorId');
    const rootCategoryObjectId = toObjectId(rootCategoryId, 'rootCategoryId');
    const shouldRestoreDeleted =
      updates.restoreDeleted === true || updates.isDeleted === false;

    if (shouldRestoreDeleted) {
      const existingNode = await VendorCustomPackage.findOne({
        _id: nodeId,
        vendorId: vendorObjectId,
        rootCategoryId: rootCategoryObjectId,
      });

      if (!existingNode) {
        return res.status(404).json({
          success: false,
          message: 'Custom package not found',
        });
      }

      const descendantIds = await VendorCustomPackage.find({
        vendorId: vendorObjectId,
        rootCategoryId: rootCategoryObjectId,
        ancestorNodeIds: nodeId,
      }).distinct('_id');

      const idsToRestore = [nodeId, ...descendantIds];
      const pricingStatus = updates.pricingStatus || 'Active';

      await VendorCustomPackage.updateMany(
        {
          _id: { $in: idsToRestore },
          vendorId: vendorObjectId,
          rootCategoryId: rootCategoryObjectId,
        },
        {
          $set: {
            isDeleted: false,
            deletedAt: null,
            pricingStatus,
          },
        }
      );

      const restoredNode = await VendorCustomPackage.findOne({
        _id: nodeId,
        vendorId: vendorObjectId,
        rootCategoryId: rootCategoryObjectId,
      }).lean();

      return res.json({
        success: true,
        message: 'Custom package restored',
        data: restoredNode,
        restoredCount: idsToRestore.length,
      });
    }

    const node = await VendorCustomPackage.findOne({
      _id: nodeId,
      vendorId: vendorObjectId,
      rootCategoryId: rootCategoryObjectId,
      isDeleted: false,
    });

    if (!node) {
      return res.status(404).json({
        success: false,
        message: 'Custom package not found',
      });
    }

    const allowedFields = [
      'name',
      'imageUrl',
      'iconUrl',
      'description',
      'terms',
      'packagesIncludes',
      'freeText',
      'enableFreeText',
      'offerText',
      'offerStartDate',
      'offerEndDate',
      'inventoryLabelName',
      'parentSelectorLabel',
      'pricingStatus',
      'visibleToUser',
      'visibleToVendor',
      'sequence',
      'nodeType',
      'isLeaf',
      'price',
      'customType',
      'variantMode',
    ];

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        node[field] = updates[field];
      }
    });

    applyOfferDateFields(node, updates);
    validateOfferDateRange(node.offerStartDate, node.offerEndDate);

    const effectiveCustomType = normalizeCustomType(node.customType);
    node.customType = node.customType == null ? '' : String(node.customType || '').trim().toLowerCase();
    node.variantMode = normalizeVariantMode(node.variantMode, effectiveCustomType, node.isLeaf);

    if (effectiveCustomType === 'offer') {
      node.isLeaf = true;
      node.nodeType = 'package_item';
      node.price = null;
      node.variantMode = 'single';
      if (!String(node.offerText || '').trim()) {
        return res.status(400).json({
          success: false,
          message: 'offerText is required for custom offers',
        });
      }
      if (!String(node.name || '').trim()) {
        node.name = String(node.offerText || 'Offer').trim();
      }
    } else if (node.isLeaf && (node.price == null || Number.isNaN(Number(node.price)))) {
      return res.status(400).json({
        success: false,
        message: 'price is required for leaf custom package nodes',
      });
    }

    if (!node.isLeaf) {
      node.price = null;
    } else if (node.price != null) {
      node.price = Number(node.price);
    }

    await node.save();

    return res.json({
      success: true,
      message: 'Custom package updated',
      data: node.toObject(),
    });
  } catch (error) {
    console.error('PUT /vendor-custom-packages/:id error:', error);
    return res.status(error.status || 400).json({
      success: false,
      message: error.message || 'Failed to update vendor custom package',
    });
  }
});

router.delete('/:id', requireVendorWriteAccess((req) => req.query?.vendorId), async (req, res) => {
  try {
    const { vendorId, rootCategoryId } = req.query;
    if (!vendorId || !rootCategoryId) {
      return res.status(400).json({
        success: false,
        message: 'vendorId and rootCategoryId are required',
      });
    }

    const nodeId = toObjectId(req.params.id, 'id');
    const vendorObjectId = toObjectId(vendorId, 'vendorId');
    const rootCategoryObjectId = toObjectId(rootCategoryId, 'rootCategoryId');

    const node = await VendorCustomPackage.findOne({
      _id: nodeId,
      vendorId: vendorObjectId,
      rootCategoryId: rootCategoryObjectId,
      isDeleted: false,
    });

    if (!node) {
      return res.status(404).json({
        success: false,
        message: 'Custom package not found',
      });
    }

    const descendantIds = await VendorCustomPackage.find({
      vendorId: vendorObjectId,
      rootCategoryId: rootCategoryObjectId,
      isDeleted: false,
      ancestorNodeIds: nodeId,
    }).distinct('_id');

    const idsToDelete = [nodeId, ...descendantIds];

    await VendorCustomPackage.updateMany(
      { _id: { $in: idsToDelete } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      }
    );

    return res.json({
      success: true,
      message: 'Custom package deleted',
      deletedCount: idsToDelete.length,
    });
  } catch (error) {
    console.error('DELETE /vendor-custom-packages/:id error:', error);
    return res.status(error.status || 400).json({
      success: false,
      message: error.message || 'Failed to delete vendor custom package',
    });
  }
});

module.exports = router;
