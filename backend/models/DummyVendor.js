const mongoose = require("mongoose");
const {
  getDefaultWhatsappBusinessConfig,
  whatsappBusinessConfigSchema,
} = require("./whatsappBusinessConfigSchema");

/**
 * Google Place metadata (read-only)
 * Populated from Google Places API
 * Optional field – existing vendors remain valid
 */
const googlePlaceSchema = new mongoose.Schema(
  {
    placeId: { type: String, index: true },

    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: null,
    },

    userRatingsTotal: {
      type: Number,
      default: 0,
    },

    mapsUrl: {
      type: String,
      default: "",
    },

    types: {
      type: [String],
      default: [],
    },

    lastSyncedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false } // embedded object, no separate _id
);

const dummyVendorSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    required: true,
  },

  phone: {
    type: String,
    required: true,
  },

  businessName: {
    type: String,
    required: true,
  },

  subdomain: {
    type: String,
    lowercase: true,
    trim: true,
    unique: true,
    sparse: true,
  },

  contactName: {
    type: String,
    required: true,
  },

  logoUrl: {
    type: String,
    default: "",
    trim: true,
  },

  secondaryPhones: {
    type: [String],
    default: [],
  },

  languagePreference: {
    type: String,
    enum: ["en", "te"],
    default: "en",
  },

  // Link to top-level DummyCategory
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DummyCategory",
    required: true,
  },

  status: {
    type: String,
    enum: [
      "Accepted",
      "Pending",
      "Rejected",
      "Waiting for Approval",
      "Registered",
      "Profile Setup",
      "Preview",
      "Published",
      "Inactive",
      "Active",
    ],
    default: "Registered",
  },

  location: {
    lat: { type: Number },
    lng: { type: Number },
    address: { type: String },
    nearbyLocations: { type: [String], default: [] },
  },

  serviceAreas: {
    primaryLocality: { type: String }, // Yapral
    city: { type: String }, // Secunderabad
    targetAreas: [{ type: String }], // vendor chosen areas
    autoSuggested: { type: Boolean, default: false },
  },

  /**
   * ✅ Google Place info
   * Stored only if user connects Google Business
   */
  googlePlace: {
    type: googlePlaceSchema,
    default: null,
  },

  /**
   * ⭐ Vendor Trust Summary (Denormalized for fast reads)
   */
trustSummary: {
  type: mongoose.Schema.Types.Mixed,
  default: {},
},

  businessHours: [
    {
      day: { type: String, required: true },
      hours: { type: String, required: true },
    },
  ],

  profilePictures: {
    type: [String],
    default: [],
  },

  rowImages: {
    type: Object,
    default: {},
  },

  inventorySelections: {
    type: Object,
    default: {},
  },

  // Per-vendor pricing visibility overrides
  // { [nodeId: string]: 'Active' | 'Inactive' }
  nodePricingStatus: {
    type: Object,
    default: {},
  },

  // Per-vendor social links
  socialLinks: {
    type: Object,
    default: {},
  },

  billingPreferences: {
    sendWhatsAppBill: {
      type: Boolean,
      default: true,
    },
  },

  vendorLogin: {
    passcodeHash: {
      type: String,
      default: "",
      select: false,
    },
    passcodeUpdatedAt: {
      type: Date,
      default: null,
    },
  },

  whatsappBusiness: {
    type: whatsappBusinessConfigSchema,
    default: getDefaultWhatsappBusinessConfig,
  },

  // Custom fields for preview Home section
  customFields: {
    freeText1: { type: String, default: "" }, // Heading
    freeText2: { type: String, default: "" }, // Description
    quickHighlights: { type: [String], default: [] },
    founderAbout: {
      heading: { type: String, default: "" },
      body: { type: String, default: "" },
      founderName: { type: String, default: "" },
      founderRole: { type: String, default: "" },
      founderImageUrl: { type: String, default: "" },
    },
    whyUs: {
      heading: { type: String, default: "" },
      subHeading: { type: String, default: "" },
      cards: {
        type: [
          {
            title: { type: String, default: "" },
            description: { type: String, default: "" },
          },
        ],
        default: [],
      },
    },
    showcaseSection: {
      heading: { type: String, default: "" },
      subHeading: { type: String, default: "" },
      itemLabel: { type: String, default: "" },
      items: {
        type: [
          {
            name: { type: String, default: "" },
            title: { type: String, default: "" },
            subtitle: { type: String, default: "" },
            description: { type: String, default: "" },
            imageUrls: {
              type: [String],
              default: [],
            },
          },
        ],
        default: [],
      },
    },
  },

  selectedTemplateKey: {
    type: String,
    trim: true,
    default: "",
  },

  nurseryColorScheme: {
    type: String,
    trim: true,
    default: "",
  },

  modernColorScheme: {
    type: String,
    trim: true,
    default: "",
  },

  classicColorScheme: {
    type: String,
    trim: true,
    default: "",
  },

  pricingSource: {
    type: String,
    enum: ["standard", "self_managed"],
    default: "standard",
  },

  menuSourceType: {
    type: String,
    enum: ["admin_tree", "excel_upload", "pdf_upload", "manual_upload"],
    default: "admin_tree",
  },

  pricingSourceUpdatedAt: {
    type: Date,
    default: null,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

dummyVendorSchema.index({ subdomain: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("DummyVendor", dummyVendorSchema);
