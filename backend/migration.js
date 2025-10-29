require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Category = require('./models/Category');
const Subcategory = require('./models/Subcategory');

const migrateData = async () => {
  await connectDB();

  try {
    console.log('Starting migration...');

    const subcategoriesToMigrate = await Category.find({ parent: { $ne: null } });

    if (subcategoriesToMigrate.length === 0) {
      console.log('No subcategories to migrate.');
      return;
    }

    console.log(`Found ${subcategoriesToMigrate.length} subcategories to migrate.`);

    for (const oldSub of subcategoriesToMigrate) {
      const newSub = new Subcategory({
        name: oldSub.name,
        imageUrl: oldSub.imageUrl,
        iconUrl: oldSub.iconUrl,
        category: oldSub.parent,
        price: oldSub.price,
        freeText: oldSub.freeText,
        terms: oldSub.terms,
        enableFreeText: oldSub.enableFreeText,
        visibleToUser: oldSub.visibleToUser,
        visibleToVendor: oldSub.visibleToVendor,
        sequence: oldSub.sequence,
        seoKeywords: oldSub.seoKeywords,
        categoryType: oldSub.categoryType,
        availableForCart: oldSub.availableForCart,
        postRequestsDeals: oldSub.postRequestsDeals,
        loyaltyPoints: oldSub.loyaltyPoints,
        linkAttributesPricing: oldSub.linkAttributesPricing,
        freeTexts: oldSub.freeTexts,
        categoryVisibility: oldSub.categoryVisibility,
        categoryModel: oldSub.categoryModel,
        categoryPricing: oldSub.categoryPricing,
        socialHandle: oldSub.socialHandle,
        displayType: oldSub.displayType,
        inventoryLabelName: oldSub.inventoryLabelName,
        linkedAttributes: oldSub.linkedAttributes,
        colorSchemes: oldSub.colorSchemes,
        createdAt: oldSub.createdAt,
        _id: oldSub._id, // Preserve the original ID
      });

      await newSub.save();
      await Category.findByIdAndDelete(oldSub._id);
      console.log(`Migrated and removed: ${oldSub.name}`);
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    mongoose.connection.close();
  }
};

migrateData();
