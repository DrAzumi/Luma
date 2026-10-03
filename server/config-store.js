// LUMA — Dynamic Config Store
// Reads/writes bulbs-config.json at runtime.
// Supports multi-tenant properties, device configs, and groups.

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "bulbs-config.json");

// ── Default properties & bulbs ──────────────────────────────────────────────────

const DEFAULT_PROPERTIES = [
  { id: "studio", name: "Home Studio", icon: "🎙", active: true },
  { id: "villa", name: "Beach Villa", icon: "🏖", active: false },
  { id: "loft", name: "Downtown Loft", icon: "🏙", active: false },
];

// Fresh installs start empty — bulbs are added via the Devices tab or bulbs-config.json.
const DEFAULT_BULBS = [];

const DEFAULT_GROUPS = [];

// In-memory cache
let bulbs = [];
let groups = [];
let properties = [];
let activePropertyId = "studio";

// ── Load / Init ────────────────────────────────────────────────────────────────

function load() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        bulbs = data;
        groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
        properties = JSON.parse(JSON.stringify(DEFAULT_PROPERTIES));
        save();
      } else {
        bulbs = data.bulbs || [];
        groups = data.groups || JSON.parse(JSON.stringify(DEFAULT_GROUPS));
        properties = data.properties || JSON.parse(JSON.stringify(DEFAULT_PROPERTIES));
        activePropertyId = data.activePropertyId || (properties.find(p => p.active)?.id || "studio");
      }
    } else {
      bulbs = JSON.parse(JSON.stringify(DEFAULT_BULBS));
      groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
      properties = JSON.parse(JSON.stringify(DEFAULT_PROPERTIES));
      save();
    }
  } catch (e) {
    console.error("[Config] Error loading config:", e.message);
    bulbs = JSON.parse(JSON.stringify(DEFAULT_BULBS));
    groups = JSON.parse(JSON.stringify(DEFAULT_GROUPS));
    properties = JSON.parse(JSON.stringify(DEFAULT_PROPERTIES));
  }
  return { bulbs, groups, properties, activePropertyId };
}

function save() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ bulbs, groups, properties, activePropertyId }, null, 2), "utf8");
  } catch (e) {
    console.error("[Config] Error saving config:", e.message);
  }
}

// ── Properties API ─────────────────────────────────────────────────────────────

function getProperties() { return properties; }
function getActiveProperty() { return properties.find(p => p.id === activePropertyId) || properties[0]; }

function setActiveProperty(id) {
  const prop = properties.find(p => p.id === id);
  if (!prop) throw new Error(`Property "${id}" not found`);
  properties.forEach(p => p.active = (p.id === id));
  activePropertyId = id;
  save();
  return prop;
}

function addProperty(name, icon = "🏠") {
  if (!name) throw new Error("Property must have a name");
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "property";
  if (properties.find(p => p.id === id)) throw new Error(`Property "${id}" already exists`);
  const newProp = { id, name, icon, active: false };
  properties.push(newProp);
  save();
  return newProp;
}

// ── Bulbs API ──────────────────────────────────────────────────────────────────

function getBulbs() { return bulbs; }
function getBulb(id) { return bulbs.find((b) => b.id === id) || null; }

function addBulb(bulb) {
  if (!bulb.id || !bulb.name || !bulb.protocol)
    throw new Error("Bulb must have id, name, and protocol");
  if (getBulb(bulb.id)) throw new Error(`Bulb "${bulb.id}" already exists`);
  if (!bulb.propertyId) bulb.propertyId = activePropertyId;
  bulbs.push(bulb);
  save();
  return bulb;
}

function updateBulb(id, updates) {
  const idx = bulbs.findIndex((b) => b.id === id);
  if (idx === -1) throw new Error(`Bulb "${id}" not found`);
  bulbs[idx] = { ...bulbs[idx], ...updates };
  save();
  return bulbs[idx];
}

function removeBulb(id) {
  const idx = bulbs.findIndex((b) => b.id === id);
  if (idx === -1) throw new Error(`Bulb "${id}" not found`);
  const removed = bulbs.splice(idx, 1)[0];
  groups.forEach((g) => {
    g.bulbs = g.bulbs.filter((bId) => bId !== id);
  });
  save();
  return removed;
}

// ── Groups API ─────────────────────────────────────────────────────────────────

function getGroups() { return groups; }
function getGroup(id) { return groups.find((g) => g.id === id) || null; }

function addGroup(name, bulbIds) {
  if (!name) throw new Error("Group must have a name");
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "group";
  if (getGroup(id)) throw new Error(`Group "${id}" already exists`);
  const group = { id, name, bulbs: bulbIds || [] };
  groups.push(group);
  save();
  return group;
}

function updateGroup(id, updates) {
  const idx = groups.findIndex((g) => g.id === id);
  if (idx === -1) throw new Error(`Group "${id}" not found`);
  groups[idx] = { ...groups[idx], ...updates };
  save();
  return groups[idx];
}

function removeGroup(id) {
  const idx = groups.findIndex((g) => g.id === id);
  if (idx === -1) throw new Error(`Group "${id}" not found`);
  const removed = groups.splice(idx, 1)[0];
  save();
  return removed;
}

load();

module.exports = {
  getBulbs, getBulb, addBulb, updateBulb, removeBulb,
  getGroups, getGroup, addGroup, updateGroup, removeGroup,
  getProperties, getActiveProperty, setActiveProperty, addProperty,
  save, load,
};