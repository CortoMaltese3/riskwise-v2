// Single source of truth for the per-asset category map and the per-country /
// per-hazard list of selectable assets. New ERA assets only need to be added
// here — the unified Exposure card and the drift-guard test pick them up
// automatically.

export const exposureCategoryMap = {
  // Economic
  crops: "economic",
  livestock: "economic",
  power_plants: "economic",
  hotels: "economic",
  tree_crops: "economic",
  grass_crops: "economic",
  wet_markets: "economic",
  litpop: "economic",
  // Non-economic
  tree_crops_farmers: "non_economic",
  grass_crops_farmers: "non_economic",
  buddhist_monks: "non_economic",
  water_users: "non_economic",
  roads: "non_economic",
  students: "non_economic",
  hospitalised_people: "non_economic",
  diarrhea_patients: "non_economic",
};

// Order within each list is economic-first, then non-economic, so the
// unified dropdown groups visually even without a section break.
export const exposureByCountryHazard = {
  thailand: {
    flood: [
      "tree_crops",
      "grass_crops",
      "wet_markets",
      "tree_crops_farmers",
      "grass_crops_farmers",
      "diarrhea_patients",
      "buddhist_monks",
      "roads",
      "students",
    ],
    drought: [
      "tree_crops",
      "grass_crops",
      "wet_markets",
      "tree_crops_farmers",
      "grass_crops_farmers",
      "water_users",
    ],
    heatwaves: ["buddhist_monks", "students"],
  },
  egypt: {
    flood: [
      "crops",
      "livestock",
      "power_plants",
      "hotels",
      "students",
      "diarrhea_patients",
      "roads",
    ],
    heatwaves: ["crops", "livestock", "hotels", "hospitalised_people", "students"],
  },
};

export const getExposuresForSelection = (country, hazard) => {
  if (!country || !hazard) return [];
  return exposureByCountryHazard[country]?.[hazard] ?? [];
};
