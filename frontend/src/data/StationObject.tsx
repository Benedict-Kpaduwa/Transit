export interface Station {
  name: string;
  coords: [number, number];
  line: "Red" | "Blue";
  route: "201" | "202";
  shared?: boolean;
}

export const stationsData = {
  red: [
    {
      name: "Tuscany",
      coords: [-114.24248, 51.16307],
      line: "Red",
      route: "201",
    },
    {
      name: "Crowfoot",
      coords: [-114.20214, 51.12609],
      line: "Red",
      route: "201",
    },
    {
      name: "Dalhousie",
      coords: [-114.16338, 51.10318],
      line: "Red",
      route: "201",
    },
    {
      name: "Brentwood",
      coords: [-114.12958, 51.08732],
      line: "Red",
      route: "201",
    },
    {
      name: "University",
      coords: [-114.12787, 51.07812],
      line: "Red",
      route: "201",
    },
    {
      name: "Banff Trail",
      coords: [-114.11627, 51.07085],
      line: "Red",
      route: "201",
    },
    {
      name: "Lions Park",
      coords: [-114.10987, 51.06438],
      line: "Red",
      route: "201",
    },
    {
      name: "SAIT/ACAD/Jubilee",
      coords: [-114.09872, 51.05841],
      line: "Red",
      route: "201",
    },

    {
      name: "8 Street SW",
      coords: [-114.08108, 51.0462],
      line: "Red",
      route: "201",
      shared: true,
    },
    {
      name: "7 Street SW",
      coords: [-114.07925, 51.0462],
      line: "Red",
      route: "201",
      shared: true,
    },
    {
      name: "6 Street SW",
      coords: [-114.07742, 51.0462],
      line: "Red",
      route: "201",
      shared: true,
    },
    {
      name: "4 Street SW",
      coords: [-114.07377, 51.0462],
      line: "Red",
      route: "201",
      shared: true,
    },
    {
      name: "3 Street SW",
      coords: [-114.07195, 51.0462],
      line: "Red",
      route: "201",
      shared: true,
    },
    {
      name: "1 Street SW",
      coords: [-114.0683, 51.0462],
      line: "Red",
      route: "201",
      shared: true,
    },
    {
      name: "Centre Street",
      coords: [-114.06465, 51.0462],
      line: "Red",
      route: "201",
      shared: true,
    },
    {
      name: "City Hall/Bow Valley College",
      coords: [-114.05892, 51.0462],
      line: "Red",
      route: "201",
      shared: true,
    },

    // Northeast Red Line (201)
    {
      name: "Bridgeland/Memorial",
      coords: [-114.04162, 51.04852],
      line: "Red",
      route: "201",
    },
    { name: "Zoo", coords: [-114.03098, 51.04787], line: "Red", route: "201" },
    {
      name: "Barlow/Max Bell",
      coords: [-113.99817, 51.04635],
      line: "Red",
      route: "201",
    },
    {
      name: "Franklin",
      coords: [-113.97992, 51.04968],
      line: "Red",
      route: "201",
    },
    {
      name: "Marlborough",
      coords: [-113.95428, 51.05948],
      line: "Red",
      route: "201",
    },
    {
      name: "Rundle",
      coords: [-113.93877, 51.07492],
      line: "Red",
      route: "201",
    },
    {
      name: "Whitehorn",
      coords: [-113.92738, 51.08472],
      line: "Red",
      route: "201",
    },
    {
      name: "McKnight-Westwinds",
      coords: [-113.91748, 51.09662],
      line: "Red",
      route: "201",
    },
    {
      name: "Martindale",
      coords: [-113.90858, 51.11298],
      line: "Red",
      route: "201",
    },
    {
      name: "Saddletowne",
      coords: [-113.89928, 51.12588],
      line: "Red",
      route: "201",
    },
  ],

  blue: [
    {
      name: "69 Street",
      coords: [-114.18962, 51.03888],
      line: "Blue",
      route: "202",
    },
    {
      name: "Westbrook",
      coords: [-114.14832, 51.03888],
      line: "Blue",
      route: "202",
    },
    {
      name: "Shaganappi Point",
      coords: [-114.13118, 51.03888],
      line: "Blue",
      route: "202",
    },
    {
      name: "Sunalta",
      coords: [-114.10288, 51.03888],
      line: "Blue",
      route: "202",
    },
    {
      name: "Downtown West/Kerby",
      coords: [-114.09048, 51.0462],
      line: "Blue",
      route: "202",
    },

    {
      name: "8 Street SW",
      coords: [-114.08108, 51.0462],
      line: "Blue",
      route: "202",
      shared: true,
    },
    {
      name: "7 Street SW",
      coords: [-114.07925, 51.0462],
      line: "Blue",
      route: "202",
      shared: true,
    },
    {
      name: "6 Street SW",
      coords: [-114.07742, 51.0462],
      line: "Blue",
      route: "202",
      shared: true,
    },
    {
      name: "4 Street SW",
      coords: [-114.07377, 51.0462],
      line: "Blue",
      route: "202",
      shared: true,
    },
    {
      name: "3 Street SW",
      coords: [-114.07195, 51.0462],
      line: "Blue",
      route: "202",
      shared: true,
    },
    {
      name: "1 Street SW",
      coords: [-114.0683, 51.0462],
      line: "Blue",
      route: "202",
      shared: true,
    },
    {
      name: "Centre Street",
      coords: [-114.06465, 51.0462],
      line: "Blue",
      route: "202",
      shared: true,
    },
    {
      name: "City Hall/Bow Valley College",
      coords: [-114.05892, 51.0462],
      line: "Blue",
      route: "202",
      shared: true,
    },

    // South Blue Line (202) – ONLY Blue Line
    {
      name: "Erlton/Stampede",
      coords: [-114.05892, 51.03888],
      line: "Blue",
      route: "202",
    },
    {
      name: "39 Avenue",
      coords: [-114.05892, 51.01888],
      line: "Blue",
      route: "202",
    },
    {
      name: "Chinook",
      coords: [-114.05892, 51.00688],
      line: "Blue",
      route: "202",
    },
    {
      name: "Heritage",
      coords: [-114.05892, 50.99188],
      line: "Blue",
      route: "202",
    },
    {
      name: "Southland",
      coords: [-114.05892, 50.96588],
      line: "Blue",
      route: "202",
    },
    {
      name: "Anderson",
      coords: [-114.05892, 50.95288],
      line: "Blue",
      route: "202",
    },
    {
      name: "Canyon Meadows",
      coords: [-114.05892, 50.93888],
      line: "Blue",
      route: "202",
    },
    {
      name: "Fish Creek-Lacombe",
      coords: [-114.05892, 50.92288],
      line: "Blue",
      route: "202",
    },
    {
      name: "Shawnessy",
      coords: [-114.05892, 50.90888],
      line: "Blue",
      route: "202",
    },
    {
      name: "Somerset-Bridlewood",
      coords: [-114.05892, 50.89388],
      line: "Blue",
      route: "202",
    },
  ],
} as const;
