import { useEffect, useRef, useState, useMemo } from "react";
import { Map, NavigationControl, Marker, Popup } from "../vendor/maplibre-gl/maplibre-gl.mjs";
import "../vendor/maplibre-gl/maplibre-gl.css";
import {
  Zap,
  Layers,
  Search,
  ExternalLink,
  MapPin,
  Compass,
  Maximize2,
  Minimize2,
  RotateCcw,
  Shield,
  Eye,
  Info,
  Sliders,
  Check,
  ChevronRight,
  Radio,
  Activity,
  Flame,
  Key,
  X,
  HelpCircle,
  AlertCircle,
} from "lucide-react";
import TopNavbar from "../components/layout/TopNavbar";

/* ─────────────────────────────────────────────────────────────
   West Bengal Grid Substations & Generating Stations Directory
   Curated for instant identification, search, and map flyTo
───────────────────────────────────────────────────────────── */
const WB_SUBSTATIONS_CATALOG = [
  // 400 kV & 765 kV Grid Substations
  {
    id: "jeenat",
    name: "Jeenat 400/220 kV Substation",
    shortName: "Jeenat",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "WBSETCL",
    district: "Birbhum",
    lat: 23.900,
    lon: 87.500,
    type: "Grid Substation",
    description: "Crucial central 400/220 kV wheeling node of WBSETCL network connecting Durgapur, Bakreswar, and Gokarna.",
  },
  {
    id: "rajarhat",
    name: "Rajarhat 400/220 kV GIS Substation",
    shortName: "Rajarhat",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "POWERGRID",
    district: "North 24 Parganas",
    lat: 22.583,
    lon: 88.487,
    type: "GIS Substation",
    description: "State-of-the-art Gas Insulated Substation serving Greater Kolkata metropolitan demand.",
  },
  {
    id: "subhasgram",
    name: "Subhasgram 400/220 kV Substation",
    shortName: "Subhasgram",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "POWERGRID",
    district: "South 24 Parganas",
    lat: 22.418,
    lon: 88.412,
    type: "Grid Substation",
    description: "Major southern gateway for power feed into CESC Kolkata grid and South 24 Parganas.",
  },
  {
    id: "durgapur",
    name: "Durgapur 400/220 kV Substation",
    shortName: "Durgapur (PG)",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "POWERGRID",
    district: "Paschim Bardhaman",
    lat: 23.505,
    lon: 87.318,
    type: "Grid Substation",
    description: "Key inter-regional Eastern Region pooling station linking Jharkhand and West Bengal.",
  },
  {
    id: "bakreswar",
    name: "Bakreswar TPS Switchyard",
    shortName: "Bakreswar TPS",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "WBPDCL",
    district: "Birbhum",
    lat: 23.828,
    lon: 87.452,
    type: "Power Plant Switchyard",
    description: "5x210 MW Thermal Power Station switchyard evacuating power to Jeenat, Bidhan Nagar, and Parulia.",
  },
  {
    id: "kolaghat",
    name: "Kolaghat TPS Switchyard & 400kV Substation",
    shortName: "Kolaghat TPS",
    voltage: "400/220/132 kV",
    voltageClass: 400,
    operator: "WBPDCL / WBSETCL",
    district: "Purba Medinipur",
    lat: 22.429,
    lon: 87.873,
    type: "Power Plant Switchyard",
    description: "Major 1260 MW generation hub and interconnected 400/220/132kV transmission hub feeding South Bengal.",
  },
  {
    id: "sagardighi",
    name: "Sagardighi TPS 400/220 kV Switchyard",
    shortName: "Sagardighi TPS",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "WBPDCL",
    district: "Murshidabad",
    lat: 24.364,
    lon: 88.096,
    type: "Power Plant Switchyard",
    description: "Evacuates power from 1600 MW+ units to Gokarna, Parulia, and North Bengal grid.",
  },
  {
    id: "farakka",
    name: "Farakka Super Thermal Power Station (STPS)",
    shortName: "Farakka STPS",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "NTPC / POWERGRID",
    district: "Murshidabad",
    lat: 24.778,
    lon: 87.905,
    type: "Power Plant Switchyard",
    description: "2100 MW NTPC flagship generating station with extensive 400kV transmission links to Malda, Kahalgaon, and Jeenat.",
  },
  {
    id: "gokarna",
    name: "Gokarna 400/220 kV Substation",
    shortName: "Gokarna",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "WBSETCL",
    district: "Murshidabad",
    lat: 24.038,
    lon: 88.179,
    type: "Grid Substation",
    description: "Major 400/220 kV pooling station connecting Sagardighi, Berhampore, and Jeenat.",
  },
  {
    id: "arambagh",
    name: "Arambagh 400/220 kV Substation",
    shortName: "Arambagh",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "WBSETCL",
    district: "Hooghly",
    lat: 22.885,
    lon: 87.781,
    type: "Grid Substation",
    description: "High-capacity bulk transmission node serving Hooghly, Bankura, and Howrah districts.",
  },
  {
    id: "burdwan_paraj",
    name: "Burdwan (Paraj) 400/220 kV Substation",
    shortName: "Burdwan (Paraj)",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "WBSETCL",
    district: "Purba Bardhaman",
    lat: 23.398,
    lon: 87.652,
    type: "Grid Substation",
    description: "400/220kV bulk transmission hub reinforcing central West Bengal grid stability.",
  },
  {
    id: "bishnupur",
    name: "Bishnupur 400/220 kV Substation",
    shortName: "Bishnupur",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "WBSETCL",
    district: "Bankura",
    lat: 23.080,
    lon: 87.320,
    type: "Grid Substation",
    description: "Vital southwest transmission substation interconnecting Midnapore and Arambagh corridors.",
  },
  {
    id: "midnapore",
    name: "Midnapore (Kharagpur) 400/220 kV Substation",
    shortName: "Midnapore",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "POWERGRID",
    district: "Paschim Medinipur",
    lat: 22.404,
    lon: 87.317,
    type: "Grid Substation",
    description: "765/400kV inter-state transmission terminal connected to Ranchi, Baripada, and Kolaghat.",
  },
  {
    id: "santaldih",
    name: "Santaldih TPS Switchyard",
    shortName: "Santaldih TPS",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "WBPDCL",
    district: "Purulia",
    lat: 23.598,
    lon: 86.467,
    type: "Power Plant Switchyard",
    description: "Evacuation switchyard for Santaldih thermal units (500 MW) into Purulia and Durgapur rings.",
  },
  {
    id: "ppsp",
    name: "Purulia Pumped Storage Project (PPSP)",
    shortName: "PPSP (900 MW)",
    voltage: "400 kV",
    voltageClass: 400,
    operator: "WBSEDCL",
    district: "Purulia",
    lat: 23.201,
    lon: 86.177,
    type: "Hydro / Pumped Storage",
    description: "4x225 MW Pumped Storage Hydro generation facility offering peak power and grid frequency support.",
  },
  {
    id: "mejia",
    name: "Mejia Thermal Power Station (MTPS)",
    shortName: "Mejia MTPS",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "DVC",
    district: "Bankura",
    lat: 23.454,
    lon: 87.132,
    type: "Power Plant Switchyard",
    description: "2340 MW DVC mega thermal station switchyard connected to Maithon, Durgapur, and Arambagh.",
  },
  {
    id: "malda",
    name: "Malda 400/220/132 kV Substation",
    shortName: "Malda",
    voltage: "400/220/132 kV",
    voltageClass: 400,
    operator: "POWERGRID",
    district: "Malda",
    lat: 25.042,
    lon: 88.138,
    type: "Grid Substation",
    description: "Strategic transmission corridor connecting Eastern Region to North East and Bangladesh inter-connector.",
  },
  {
    id: "siliguri",
    name: "Siliguri 400/220 kV Substation",
    shortName: "Siliguri",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "POWERGRID",
    district: "Jalpaiguri",
    lat: 26.702,
    lon: 88.389,
    type: "Grid Substation",
    description: "Primary power corridor node for North Bengal, Sikkim hydro evacuation (Rangpo/Teesta), and Bhutan lines.",
  },
  {
    id: "alipurduar",
    name: "Alipurduar 400/220 kV & HVDC Terminal",
    shortName: "Alipurduar",
    voltage: "400/220 kV & HVDC",
    voltageClass: 400,
    operator: "POWERGRID",
    district: "Alipurduar",
    lat: 26.495,
    lon: 89.531,
    type: "HVDC / AC Substation",
    description: "Crucial ±800kV HVDC terminal connecting North East India and West Bengal grid.",
  },
  {
    id: "maithon",
    name: "Maithon 400/220 kV Substation",
    shortName: "Maithon (PG/DVC)",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "POWERGRID / DVC",
    district: "Paschim Bardhaman border",
    lat: 23.791,
    lon: 86.804,
    type: "Grid Substation",
    description: "400/220 kV transmission hub receiving generation from Maithon Right Bank (MPL) and Damodar Valley.",
  },
  {
    id: "new_purnea",
    name: "New Purnea 400/220 kV Substation",
    shortName: "New Purnea",
    voltage: "400/220 kV",
    voltageClass: 400,
    operator: "POWERGRID",
    district: "Inter-State (Bihar/WB Border)",
    lat: 25.780,
    lon: 87.480,
    type: "Grid Substation",
    description: "Major inter-state transmission tie feeding North Bengal from Bihar & Eastern Region.",
  },

  // 220 kV Substations & Industrial Centers
  {
    id: "haldia",
    name: "Haldia 220/132 kV Substation",
    shortName: "Haldia",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "WBSETCL",
    district: "Purba Medinipur",
    lat: 22.064,
    lon: 88.077,
    type: "Industrial Substation",
    description: "Serves the Haldia petrochemical hub, port complexes, and heavy industries.",
  },
  {
    id: "kasba",
    name: "Kasba 220/132/33 kV Substation",
    shortName: "Kasba",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "WBSETCL",
    district: "Kolkata",
    lat: 22.511,
    lon: 88.391,
    type: "City Grid Substation",
    description: "Feeds South Kolkata city load and provides interconnection with CESC network.",
  },
  {
    id: "barasat",
    name: "Barasat 220/132 kV Substation",
    shortName: "Barasat",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "WBSETCL",
    district: "North 24 Parganas",
    lat: 22.723,
    lon: 88.483,
    type: "Substation",
    description: "Crucial northern ring substation serving Barrackpore and suburban North 24 Parganas.",
  },
  {
    id: "howrah",
    name: "Howrah 220/132 kV Substation",
    shortName: "Howrah",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "WBSETCL",
    district: "Howrah",
    lat: 22.593,
    lon: 88.267,
    type: "Substation",
    description: "Major distribution and industrial power feed for Howrah district.",
  },
  {
    id: "rishra",
    name: "Rishra 220/132 kV Substation",
    shortName: "Rishra",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "WBSETCL",
    district: "Hooghly",
    lat: 22.712,
    lon: 88.341,
    type: "Substation",
    description: "Industrial feeder node for Hooghly river industrial belt.",
  },
  {
    id: "bandel",
    name: "Bandel TPS 220/132 kV Switchyard",
    shortName: "Bandel TPS",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "WBPDCL",
    district: "Hooghly",
    lat: 22.996,
    lon: 88.405,
    type: "Power Plant Switchyard",
    description: "Historic power generation hub (Unit-5 215 MW) connected to Rishra, Dharampur, and Burdwan.",
  },
  {
    id: "budge_budge",
    name: "Budge Budge Generating Station",
    shortName: "Budge Budge (CESC)",
    voltage: "220 kV",
    voltageClass: 220,
    operator: "CESC",
    district: "South 24 Parganas",
    lat: 22.477,
    lon: 88.175,
    type: "Power Plant Switchyard",
    description: "750 MW CESC coal-fired power plant supplying electricity to Kolkata and Howrah.",
  },
  {
    id: "titagarh",
    name: "Titagarh Generating Station & Substation",
    shortName: "Titagarh (CESC)",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "CESC",
    district: "North 24 Parganas",
    lat: 22.738,
    lon: 88.375,
    type: "Generating / Grid Substation",
    description: "Northern CESC generation and 220kV transmission substation.",
  },
  {
    id: "berhampore",
    name: "Berhampore 220/132 kV Substation",
    shortName: "Berhampore",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "WBSETCL",
    district: "Murshidabad",
    lat: 24.100,
    lon: 88.250,
    type: "Substation",
    description: "Regional transmission hub connecting Murshidabad and Nadia distribution.",
  },
  {
    id: "asansol",
    name: "Asansol 220/132 kV Substation",
    shortName: "Asansol (DVC/WB)",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "DVC",
    district: "Paschim Bardhaman",
    lat: 23.688,
    lon: 86.966,
    type: "Industrial Substation",
    description: "Supplies power to coal mining, railways, steel manufacturing, and industrial consumers.",
  },
  {
    id: "kharagpur_wb",
    name: "Kharagpur 220/132 kV Substation",
    shortName: "Kharagpur (WB)",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "WBSETCL",
    district: "Paschim Medinipur",
    lat: 22.340,
    lon: 87.320,
    type: "Substation",
    description: "Supplies IIT Kharagpur, railway division, and industrial estates.",
  },
  {
    id: "purulia_town",
    name: "Purulia 220/132 kV Substation",
    shortName: "Purulia Town",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "WBSETCL",
    district: "Purulia",
    lat: 23.330,
    lon: 86.360,
    type: "Substation",
    description: "Receives bulk power from Santaldih and PPSP to feed southwest district grids.",
  },
  {
    id: "siliguri_wb",
    name: "Siliguri (Fulbari) 220/132 kV Substation",
    shortName: "Fulbari (Siliguri)",
    voltage: "220/132 kV",
    voltageClass: 220,
    operator: "WBSETCL",
    district: "Jalpaiguri",
    lat: 26.650,
    lon: 88.420,
    type: "Substation",
    description: "Distributes power across Darjeeling foothills, Jalpaiguri, and Siliguri commercial hub.",
  },
  {
    id: "kurseong",
    name: "Kurseong 132/66/33 kV Substation",
    shortName: "Kurseong",
    voltage: "132/66 kV",
    voltageClass: 132,
    operator: "WBSETCL",
    district: "Darjeeling",
    lat: 26.880,
    lon: 88.280,
    type: "Hill Substation",
    description: "Stepped-down transmission line feeding tea gardens and Darjeeling hill district.",
  },
];

// Base map style options (Watermark-free, zero-API-key defaults)
export const BASEMAP_PROVIDERS = [
  {
    id: "osm",
    label: "OpenStreetMap Standard",
    shortLabel: "OSM",
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>',
    requiresKey: false,
    badge: "Free • No Key",
    tiles: [
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    ],
    description: "Standard OpenStreetMap with towns, highways, and district boundaries.",
  },
  {
    id: "esri-gray",
    label: "Esri Light Gray Canvas",
    shortLabel: "Light",
    attribution: 'Tiles © <a href="https://www.esri.com/" target="_blank">Esri</a>, HERE, Garmin, © OpenStreetMap contributors',
    requiresKey: false,
    badge: "Free • No Key",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ],
    description: "Minimalist light gray canvas. Gives maximum contrast for power transmission lines and substation badges.",
  },
  {
    id: "satellite",
    label: "Esri Satellite Imagery",
    shortLabel: "Satellite",
    attribution: 'Tiles © <a href="https://www.esri.com/" target="_blank">Esri</a>, Maxar, Earthstar Geographics',
    requiresKey: false,
    badge: "Free • No Key",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    description: "High resolution aerial satellite imagery showing actual switchyards, terrain, and rivers.",
  },
  {
    id: "esri-topo",
    label: "Esri Topographic",
    shortLabel: "Topo",
    attribution: 'Tiles © <a href="https://www.esri.com/" target="_blank">Esri</a>, USGS',
    requiresKey: false,
    badge: "Free • No Key",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    description: "Topographic contours, terrain relief, and geographical landmarks.",
  },
  {
    id: "carto-voyager",
    label: "CARTO Voyager",
    shortLabel: "CARTO",
    attribution: '© <a href="https://carto.com/" target="_blank">CARTO</a>, © OpenStreetMap contributors',
    requiresKey: true,
    badge: "API Key Req.",
    getTiles: (key) => [
      `https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${key ? `?key=${key}` : ""}`,
      `https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${key ? `?key=${key}` : ""}`,
      `https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${key ? `?key=${key}` : ""}`,
    ],
    description: "CARTO Voyager raster basemap. Requires free CARTO API key from carto.com/basemaps/apikey.",
  },
];

export default function WestBengalPowerMap() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  // API Key & Basemap state
  const [cartoApiKey, setCartoApiKey] = useState(() => {
    return localStorage.getItem("rtg_carto_api_key") || import.meta.env.VITE_CARTO_API_KEY || "";
  });
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [tempKeyInput, setTempKeyInput] = useState(cartoApiKey);

  // UI state - Default to OpenStreetMap Standard (100% free, zero watermark, no API key required)
  const [activeBaseMap, setActiveBaseMap] = useState("osm");
  const [selectedSubstation, setSelectedSubstation] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [voltageFilter, setVoltageFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);

  // Layer toggles
  const [layersVisibility, setLayersVisibility] = useState({
    powerLines: true,
    substations: true,
    substationLabels: true,
    powerPlants: true,
  });

  // Filtered substations catalog
  const filteredSubstations = useMemo(() => {
    return WB_SUBSTATIONS_CATALOG.filter((sub) => {
      const matchesSearch =
        searchQuery === "" ||
        sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sub.operator.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesVoltage =
        voltageFilter === "all" ||
        (voltageFilter === "400" && sub.voltageClass >= 400) ||
        (voltageFilter === "220" && sub.voltageClass === 220) ||
        (voltageFilter === "132" && sub.voltageClass === 132);

      const matchesOperator =
        operatorFilter === "all" || sub.operator.toUpperCase().includes(operatorFilter.toUpperCase());

      return matchesSearch && matchesVoltage && matchesOperator;
    });
  }, [searchQuery, voltageFilter, operatorFilter]);

  // Initialize MapLibre GL Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // West Bengal center: coordinates from user link (22.21, 87.641)
    const initialCenter = [87.641, 23.2];
    const initialZoom = 7.6;

    const activeProvider = BASEMAP_PROVIDERS.find((b) => b.id === activeBaseMap) || BASEMAP_PROVIDERS[0];
    const initialTiles = activeProvider.getTiles ? activeProvider.getTiles(cartoApiKey) : activeProvider.tiles;

    try {
      const map = new Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            "base-tiles": {
              type: "raster",
              tiles: initialTiles,
              tileSize: 256,
              attribution: activeProvider.attribution,
            },
            openinframap: {
              type: "vector",
              tiles: ["https://openinframap.org/tiles/{z}/{x}/{y}.pbf"],
              maxzoom: 17,
              attribution:
                '<a href="https://openinframap.org" target="_blank">Open Infrastructure Map</a> | <a href="https://maplibre.org" target="_blank">MapLibre</a>',
            },
          },
          layers: [
            // Base raster map
            {
              id: "base-tiles-layer",
              type: "raster",
              source: "base-tiles",
              minzoom: 0,
              maxzoom: 20,
            },
            // Power line halo / casing for high contrast
            {
              id: "power-line-casing",
              type: "line",
              source: "openinframap",
              "source-layer": "power_line",
              layout: {
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": "#FFFFFF",
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  6, 2,
                  10, 4.5,
                  14, 7,
                ],
                "line-opacity": 0.7,
              },
            },
            // Power line core (color-coded by voltage)
            {
              id: "power-line-core",
              type: "line",
              source: "openinframap",
              "source-layer": "power_line",
              layout: {
                "line-join": "round",
                "line-cap": "round",
              },
              paint: {
                "line-color": [
                  "case",
                  [">=", ["to-number", ["get", "voltage"], 0], 700000], "#D81B60",
                  [">=", ["to-number", ["get", "voltage"], 0], 380000], "#E53935",
                  [">=", ["to-number", ["get", "voltage"], 0], 200000], "#FB8C00",
                  [">=", ["to-number", ["get", "voltage"], 0], 100000], "#1E88E5",
                  [">=", ["to-number", ["get", "voltage"], 0], 60000], "#43A047",
                  [">=", ["to-number", ["get", "voltage"], 0], 30000], "#8E24AA",
                  "#64748B",
                ],
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  6,
                  [
                    "case",
                    [">=", ["to-number", ["get", "voltage"], 0], 380000], 2.8,
                    [">=", ["to-number", ["get", "voltage"], 0], 200000], 2.0,
                    1.2,
                  ],
                  10,
                  [
                    "case",
                    [">=", ["to-number", ["get", "voltage"], 0], 700000], 5.0,
                    [">=", ["to-number", ["get", "voltage"], 0], 380000], 4.0,
                    [">=", ["to-number", ["get", "voltage"], 0], 200000], 2.8,
                    1.8,
                  ],
                  14,
                  [
                    "case",
                    [">=", ["to-number", ["get", "voltage"], 0], 700000], 7.0,
                    [">=", ["to-number", ["get", "voltage"], 0], 380000], 6.0,
                    [">=", ["to-number", ["get", "voltage"], 0], 200000], 4.5,
                    3.0,
                  ],
                ],
                "line-opacity": 0.95,
              },
            },
            // Substation polygons (fill)
            {
              id: "power-substation-fill",
              type: "fill",
              source: "openinframap",
              "source-layer": "power_substation",
              paint: {
                "fill-color": [
                  "case",
                  [">=", ["to-number", ["get", "voltage"], 0], 380000], "#E53935",
                  [">=", ["to-number", ["get", "voltage"], 0], 200000], "#FB8C00",
                  [">=", ["to-number", ["get", "voltage"], 0], 100000], "#1E88E5",
                  "#0EA5E9",
                ],
                "fill-opacity": 0.35,
              },
            },
            // Substation polygons (outline)
            {
              id: "power-substation-outline",
              type: "line",
              source: "openinframap",
              "source-layer": "power_substation",
              paint: {
                "line-color": [
                  "case",
                  [">=", ["to-number", ["get", "voltage"], 0], 380000], "#B91C1C",
                  [">=", ["to-number", ["get", "voltage"], 0], 200000], "#C2410C",
                  [">=", ["to-number", ["get", "voltage"], 0], 100000], "#1D4ED8",
                  "#0369A1",
                ],
                "line-width": 2,
              },
            },
            // Substation points (circles)
            {
              id: "power-substation-point-circle",
              type: "circle",
              source: "openinframap",
              "source-layer": "power_substation_point",
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  6, 3.5,
                  9, 7.0,
                  13, 10.0,
                ],
                "circle-color": [
                  "case",
                  [">=", ["to-number", ["get", "voltage"], 0], 700000], "#D81B60",
                  [">=", ["to-number", ["get", "voltage"], 0], 380000], "#E53935",
                  [">=", ["to-number", ["get", "voltage"], 0], 200000], "#FB8C00",
                  [">=", ["to-number", ["get", "voltage"], 0], 100000], "#1E88E5",
                  "#0EA5E9",
                ],
                "circle-stroke-width": 2,
                "circle-stroke-color": "#FFFFFF",
              },
            },
            // Power plants
            {
              id: "power-plant-point",
              type: "circle",
              source: "openinframap",
              "source-layer": "power_plant_point",
              paint: {
                "circle-radius": 7,
                "circle-color": "#D97706",
                "circle-stroke-width": 2.5,
                "circle-stroke-color": "#FFFFFF",
              },
            },
          ],
        },
        center: initialCenter,
        zoom: initialZoom,
        minZoom: 5.5,
        maxZoom: 18,
        // West Bengal regional bounds constraint
        maxBounds: [
          [82.0, 19.5],
          [92.5, 29.0],
        ],
      });

      // Add navigation control
      map.addControl(new NavigationControl({ showCompass: true }), "top-right");

      map.on("load", () => {
        setMapLoaded(true);

        // Click handler on Substation Points
        map.on("click", "power-substation-point-circle", (e) => {
          if (!e.features || e.features.length === 0) return;
          const feat = e.features[0];
          const props = feat.properties || {};
          const voltageNum = Number(props.voltage) || 0;
          const voltageLabel = voltageNum > 0 ? `${Math.round(voltageNum / 1000)} kV` : "Unknown kV";

          setSelectedSubstation({
            id: `osm-${feat.id || Math.random()}`,
            name: props.name || "Unnamed Substation (OSM)",
            shortName: props.name || "Substation",
            voltage: voltageLabel,
            voltageClass: Math.round(voltageNum / 1000) || 220,
            operator: props.operator || "Grid Utility",
            district: "West Bengal",
            lat: e.lngLat.lat,
            lon: e.lngLat.lng,
            type: props.substation || "Substation",
            description: `Power infrastructure mapped in OpenStreetMap. Voltage: ${voltageLabel}. Operator: ${props.operator || "Not specified"}.`,
          });
        });

        // Click handler on Substation Polygons
        map.on("click", "power-substation-fill", (e) => {
          if (!e.features || e.features.length === 0) return;
          const feat = e.features[0];
          const props = feat.properties || {};
          const voltageNum = Number(props.voltage) || 0;
          const voltageLabel = voltageNum > 0 ? `${Math.round(voltageNum / 1000)} kV` : "Unknown kV";

          setSelectedSubstation({
            id: `osm-poly-${feat.id || Math.random()}`,
            name: props.name || "Substation Switchyard",
            shortName: props.name || "Switchyard",
            voltage: voltageLabel,
            voltageClass: Math.round(voltageNum / 1000) || 220,
            operator: props.operator || "Grid Utility",
            district: "West Bengal",
            lat: e.lngLat.lat,
            lon: e.lngLat.lng,
            type: props.substation || "Substation Area",
            description: `Substation boundary mapped in OpenStreetMap. Voltage: ${voltageLabel}.`,
          });
        });

        // Click handler on Power Lines
        map.on("click", "power-line-core", (e) => {
          if (!e.features || e.features.length === 0) return;
          const feat = e.features[0];
          const props = feat.properties || {};
          const voltageNum = Number(props.voltage) || 0;
          const voltageLabel = voltageNum > 0 ? `${Math.round(voltageNum / 1000)} kV` : "Transmission Line";

          new Popup({ offset: 10, className: "power-popup" })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-family: inherit; font-size: 13px; line-height: 1.4; padding: 2px;">
                <div style="font-weight: 700; color: #0F172A; margin-bottom: 4px;">
                  ⚡ ${props.name || "Transmission Line"}
                </div>
                <div style="font-size: 11px; color: #475569;">
                  <div><b>Voltage:</b> <span style="color:#DC2626; font-weight:700;">${voltageLabel}</span></div>
                  <div><b>Operator:</b> ${props.operator || "Grid Utility"}</div>
                  <div><b>Circuits:</b> ${props.circuits || "1"}</div>
                </div>
              </div>
            `)
            .addTo(map);
        });

        // Hover cursor styling
        const pointerLayers = [
          "power-substation-point-circle",
          "power-substation-fill",
          "power-line-core",
          "power-plant-point",
        ];
        pointerLayers.forEach((layer) => {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        });
      });

      map.on("error", (e) => {
        console.warn("MapLibre GL warning:", e);
      });

      mapRef.current = map;
    } catch (err) {
      console.error("Failed to initialize MapLibre GL map:", err);
      setMapError(err.message);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update base map layer when changed or when API key changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const baseConfig = BASEMAP_PROVIDERS.find((b) => b.id === activeBaseMap);
    if (!baseConfig) return;

    const tiles = baseConfig.getTiles ? baseConfig.getTiles(cartoApiKey) : baseConfig.tiles;

    if (map.getSource("base-tiles")) {
      const source = map.getSource("base-tiles");
      if (source.setTiles) {
        source.setTiles(tiles);
      }
    }
  }, [activeBaseMap, cartoApiKey, mapLoaded]);

  const handleSelectBaseMap = (id) => {
    if (id === "carto-voyager" && !cartoApiKey) {
      setTempKeyInput(cartoApiKey);
      setKeyModalOpen(true);
      return;
    }
    setActiveBaseMap(id);
  };

  const handleSaveCartoKey = () => {
    const trimmed = tempKeyInput.trim();
    if (trimmed) {
      localStorage.setItem("rtg_carto_api_key", trimmed);
      setCartoApiKey(trimmed);
      setActiveBaseMap("carto-voyager");
    } else {
      localStorage.removeItem("rtg_carto_api_key");
      setCartoApiKey("");
      if (activeBaseMap === "carto-voyager") {
        setActiveBaseMap("osm");
      }
    }
    setKeyModalOpen(false);
  };

  const handleClearCartoKey = () => {
    localStorage.removeItem("rtg_carto_api_key");
    setCartoApiKey("");
    setTempKeyInput("");
    if (activeBaseMap === "carto-voyager") {
      setActiveBaseMap("osm");
    }
  };

  // Update layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const setVis = (layerId, visible) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
      }
    };

    setVis("power-line-core", layersVisibility.powerLines);
    setVis("power-line-casing", layersVisibility.powerLines);
    setVis("power-substation-point-circle", layersVisibility.substations);
    setVis("power-substation-fill", layersVisibility.substations);
    setVis("power-substation-outline", layersVisibility.substations);
    setVis("power-plant-point", layersVisibility.powerPlants);
  }, [layersVisibility, mapLoaded]);

  // Render HTML Markers for West Bengal curated substations so names are identified directly on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // If substation labels are disabled, don't mount DOM badges
    if (!layersVisibility.substationLabels) return;

    WB_SUBSTATIONS_CATALOG.forEach((sub) => {
      const el = document.createElement("div");
      el.className = "wb-substation-marker";
      el.style.cssText = `
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -100%);
        pointer-events: auto;
      `;

      const badgeColor =
        sub.voltageClass >= 400
          ? "#DC2626"
          : sub.voltageClass === 220
          ? "#EA580C"
          : "#2563EB";

      el.innerHTML = `
        <div style="
          background: ${badgeColor};
          color: #FFFFFF;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 999px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          white-space: nowrap;
          border: 1.5px solid #FFFFFF;
          display: flex;
          align-items: center;
          gap: 4px;
        ">
          <span>⚡ ${sub.shortName}</span>
          <span style="background: rgba(0,0,0,0.25); padding: 1px 4px; border-radius: 4px; font-size: 8.5px;">${sub.voltageClass}kV</span>
        </div>
        <div style="
          width: 0;
          height: 0;
          border-left: 4px solid transparent;
          border-right: 4px solid transparent;
          border-top: 5px solid ${badgeColor};
          margin-top: -1px;
        "></div>
      `;

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        flyToSubstation(sub);
      });

      const marker = new Marker({ element: el })
        .setLngLat([sub.lon, sub.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [mapLoaded, layersVisibility.substationLabels]);

  // Fly to Substation
  const flyToSubstation = (sub) => {
    setSelectedSubstation(sub);
    const map = mapRef.current;
    if (!map) return;

    map.flyTo({
      center: [sub.lon, sub.lat],
      zoom: 12.5,
      essential: true,
      speed: 1.3,
    });
  };

  // Reset to West Bengal whole view
  const resetToWestBengal = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [87.641, 23.2],
      zoom: 7.6,
      speed: 1.2,
    });
    setSelectedSubstation(null);
  };

  return (
    <div className="d-flex flex-column" style={{ minHeight: "100vh", backgroundColor: "#F8FAFC" }}>
      <TopNavbar />

      <main className="container-fluid px-3 py-2 flex-grow-1 d-flex flex-column">
        {/* Page Header with Reference Links */}
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2 p-3 bg-white rounded-3 border shadow-sm">
          <div>
            <div className="d-flex align-items-center gap-2">
              <span className="badge rounded-pill bg-success-subtle text-success px-2 py-1 fw-bold">
                Analytics Module
              </span>
              <span className="badge rounded-pill bg-primary-subtle text-primary px-2 py-1 fw-bold">
                West Bengal Region
              </span>
              <span className="badge rounded-pill bg-warning-subtle text-dark px-2 py-1 fw-bold">
                Test Page
              </span>
            </div>
            <h4 className="fw-bold text-dark mt-1 mb-0 d-flex align-items-center gap-2">
              <Compass size={22} className="text-primary" />
              West Bengal Power System Grid Map
            </h4>
            <div className="text-muted small mt-1">
              Interactive Substation Identification, Transmission Corridors (765kV / 400kV / 220kV / 132kV), and Power Plant Switchyards.
            </div>
          </div>

          {/* Reference Links requested by user */}
          <div className="d-flex flex-wrap align-items-center gap-2">
            <a
              href="https://openinframap.org/#7.64/22.21/87.641"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1 fw-semibold"
              title="Open Infrastructure Map centered on West Bengal"
            >
              <ExternalLink size={14} />
              Open Infrastructure Map
            </a>
            <a
              href="https://maplibre.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              title="MapLibre Open-source Mapping Engine"
            >
              <ExternalLink size={14} />
              MapLibre
            </a>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              title="OpenStreetMap Copyright & License"
            >
              <Shield size={14} />
              OSM License
            </a>
            <button
              onClick={() => {
                setTempKeyInput(cartoApiKey);
                setKeyModalOpen(true);
              }}
              className={`btn btn-sm d-flex align-items-center gap-1 ${
                cartoApiKey ? "btn-outline-success" : "btn-outline-secondary"
              }`}
              title="Basemap Styles & API Key Settings"
            >
              <Key size={14} />
              <span>{cartoApiKey ? "CARTO Key: Active" : "Basemap / Key Settings"}</span>
            </button>
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="btn btn-light border btn-sm d-flex align-items-center gap-1"
              title="Toggle Full Screen"
            >
              {isFullScreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>

        {/* Main Work Area: Left Sidebar + Map View */}
        <div
          className="row g-2 flex-grow-1"
          style={{
            minHeight: isFullScreen ? "calc(100vh - 80px)" : "720px",
            height: isFullScreen ? "calc(100vh - 80px)" : "750px",
          }}
        >
          {/* Substation Directory & Identification Panel */}
          {sidebarOpen && (
            <div className="col-12 col-lg-4 col-xl-3 d-flex flex-column" style={{ height: "100%" }}>
              <div className="card h-100 border-0 shadow-sm rounded-3 d-flex flex-column">
                <div className="card-header bg-white border-bottom p-3">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className="fw-bold text-dark d-flex align-items-center gap-2">
                      <Zap size={18} className="text-warning" />
                      Substation Identifier
                    </span>
                    <span className="badge bg-secondary-subtle text-secondary rounded-pill">
                      {filteredSubstations.length} Substations
                    </span>
                  </div>

                  {/* Search Bar */}
                  <div className="input-group input-group-sm mb-2">
                    <span className="input-group-text bg-light border-end-0">
                      <Search size={14} className="text-muted" />
                    </span>
                    <input
                      type="text"
                      className="form-control bg-light border-start-0"
                      placeholder="Search Substation name, district, or utility..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setSearchQuery("")}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="d-flex flex-wrap gap-1 mb-2">
                    {["all", "400", "220", "132"].map((vf) => (
                      <button
                        key={vf}
                        className={`btn btn-xs px-2 py-0 rounded-pill ${
                          voltageFilter === vf
                            ? "btn-dark fw-bold"
                            : "btn-outline-secondary"
                        }`}
                        style={{ fontSize: "11px" }}
                        onClick={() => setVoltageFilter(vf)}
                      >
                        {vf === "all" ? "All Voltages" : `${vf} kV`}
                      </button>
                    ))}
                  </div>

                  {/* Operator Filter */}
                  <div className="d-flex align-items-center gap-1">
                    <span className="text-muted" style={{ fontSize: "11px" }}>
                      Utility:
                    </span>
                    {["all", "WBSETCL", "POWERGRID", "DVC", "WBPDCL"].map((op) => (
                      <button
                        key={op}
                        className={`btn btn-xs px-1 py-0 ${
                          operatorFilter === op ? "text-primary fw-bold" : "text-muted"
                        }`}
                        style={{ fontSize: "11px" }}
                        onClick={() => setOperatorFilter(op)}
                      >
                        {op === "all" ? "All" : op}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Substation List */}
                <div className="card-body p-2 flex-grow-1 overflow-auto">
                  {filteredSubstations.length === 0 ? (
                    <div className="text-center py-4 text-muted small">
                      No substations matching "{searchQuery}"
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-1">
                      {filteredSubstations.map((sub) => {
                        const isSelected = selectedSubstation?.id === sub.id;
                        const vColor =
                          sub.voltageClass >= 400
                            ? "#DC2626"
                            : sub.voltageClass === 220
                            ? "#EA580C"
                            : "#2563EB";

                        return (
                          <div
                            key={sub.id}
                            onClick={() => flyToSubstation(sub)}
                            className={`p-2 rounded-2 border transition-all ${
                              isSelected
                                ? "bg-primary-subtle border-primary shadow-sm"
                                : "bg-white hover-bg-light cursor-pointer"
                            }`}
                            style={{ cursor: "pointer" }}
                          >
                            <div className="d-flex align-items-center justify-content-between">
                              <span className="fw-bold text-dark small d-flex align-items-center gap-1">
                                <span
                                  style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    backgroundColor: vColor,
                                    display: "inline-block",
                                  }}
                                />
                                {sub.name}
                              </span>
                              <ChevronRight size={14} className="text-muted" />
                            </div>
                            <div className="d-flex align-items-center gap-2 mt-1" style={{ fontSize: "11px" }}>
                              <span
                                className="fw-bold"
                                style={{ color: vColor }}
                              >
                                {sub.voltage}
                              </span>
                              <span className="text-muted">•</span>
                              <span className="badge bg-light text-dark border">
                                {sub.operator}
                              </span>
                              <span className="text-muted ms-auto">
                                {sub.district}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Reset button at bottom */}
                <div className="card-footer bg-light p-2 text-center border-top">
                  <button
                    onClick={resetToWestBengal}
                    className="btn btn-outline-secondary btn-sm w-100 d-flex align-items-center justify-content-center gap-2"
                  >
                    <RotateCcw size={14} />
                    Reset to West Bengal Overview
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Map View */}
          <div className={`col-12 ${sidebarOpen ? "col-lg-8 col-xl-9" : "col-12"} d-flex flex-column`} style={{ height: "100%" }}>
            <div className="card h-100 border-0 shadow-sm rounded-3 overflow-hidden position-relative">
              {/* Map Container */}
              <div
                ref={mapContainerRef}
                style={{ width: "100%", height: "100%", minHeight: "500px" }}
              />

              {/* Floating Top-Left Controls: Base Map Selector + Layer Toggles */}
              <div
                className="position-absolute top-0 start-0 m-3 d-flex flex-column gap-2"
                style={{ zIndex: 10, maxWidth: "320px" }}
              >
                {/* Toggle Sidebar Button */}
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="btn btn-white bg-white border shadow-sm btn-sm d-flex align-items-center gap-2 px-3 fw-semibold text-dark"
                >
                  <Sliders size={14} className="text-primary" />
                  {sidebarOpen ? "Hide Substation Panel" : "Show Substation Panel"}
                </button>

                {/* Base Map Switcher */}
                <div className="bg-white p-2 rounded-3 border shadow-sm">
                  <div
                    className="text-uppercase fw-bold text-muted mb-1 d-flex align-items-center justify-content-between"
                    style={{ fontSize: "10px" }}
                  >
                    <span>Base Map Style</span>
                    <span
                      className={`badge ${
                        activeBaseMap === "carto-voyager" && !cartoApiKey
                          ? "bg-warning-subtle text-warning border"
                          : "bg-success-subtle text-success"
                      }`}
                      style={{ fontSize: "9px" }}
                    >
                      {activeBaseMap === "carto-voyager"
                        ? cartoApiKey
                          ? "Key Active"
                          : "Key Req."
                        : "No Key Req."}
                    </span>
                  </div>
                  <div className="btn-group btn-group-sm w-100 flex-wrap">
                    {BASEMAP_PROVIDERS.map((bm) => (
                      <button
                        key={bm.id}
                        onClick={() => handleSelectBaseMap(bm.id)}
                        className={`btn btn-sm ${
                          activeBaseMap === bm.id ? "btn-dark fw-bold" : "btn-light text-muted"
                        }`}
                        style={{ fontSize: "11px" }}
                        title={`${bm.label} (${bm.badge})`}
                      >
                        {bm.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Layer Visibility Toggles */}
                <div className="bg-white p-2 rounded-3 border shadow-sm">
                  <div className="text-uppercase fw-bold text-muted mb-1 d-flex align-items-center justify-content-between" style={{ fontSize: "10px" }}>
                    <span>Grid Layers</span>
                    <Layers size={12} />
                  </div>
                  <div className="d-flex flex-column gap-1" style={{ fontSize: "11px" }}>
                    <label className="d-flex align-items-center gap-2 cursor-pointer m-0">
                      <input
                        type="checkbox"
                        checked={layersVisibility.substations}
                        onChange={(e) =>
                          setLayersVisibility({ ...layersVisibility, substations: e.target.checked })
                        }
                      />
                      <span>Substations (OpenInfraMap)</span>
                    </label>
                    <label className="d-flex align-items-center gap-2 cursor-pointer m-0">
                      <input
                        type="checkbox"
                        checked={layersVisibility.substationLabels}
                        onChange={(e) =>
                          setLayersVisibility({
                            ...layersVisibility,
                            substationLabels: e.target.checked,
                          })
                        }
                      />
                      <span className="fw-semibold text-primary">Substation Name Badges</span>
                    </label>
                    <label className="d-flex align-items-center gap-2 cursor-pointer m-0">
                      <input
                        type="checkbox"
                        checked={layersVisibility.powerLines}
                        onChange={(e) =>
                          setLayersVisibility({ ...layersVisibility, powerLines: e.target.checked })
                        }
                      />
                      <span>Transmission Lines (OIM)</span>
                    </label>
                    <label className="d-flex align-items-center gap-2 cursor-pointer m-0">
                      <input
                        type="checkbox"
                        checked={layersVisibility.powerPlants}
                        onChange={(e) =>
                          setLayersVisibility({ ...layersVisibility, powerPlants: e.target.checked })
                        }
                      />
                      <span>Power Plants / Switchyards</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Floating Bottom-Right Voltage Legend */}
              <div
                className="position-absolute bottom-0 end-0 m-3 bg-white p-2 rounded-3 border shadow-sm"
                style={{ zIndex: 10, fontSize: "11px", minWidth: "180px" }}
              >
                <div className="fw-bold text-dark border-bottom pb-1 mb-1 d-flex align-items-center gap-1">
                  <Activity size={13} className="text-danger" />
                  Voltage Legend (kV)
                </div>
                <div className="d-flex flex-column gap-1">
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ width: "16px", height: "4px", backgroundColor: "#D81B60", display: "inline-block", borderRadius: "2px" }} />
                    <span className="fw-semibold">765 kV</span>
                    <span className="text-muted ms-auto">(Inter-state)</span>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ width: "16px", height: "4px", backgroundColor: "#E53935", display: "inline-block", borderRadius: "2px" }} />
                    <span className="fw-semibold" style={{ color: "#E53935" }}>400 kV</span>
                    <span className="text-muted ms-auto">(Grid Bulk)</span>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ width: "16px", height: "4px", backgroundColor: "#FB8C00", display: "inline-block", borderRadius: "2px" }} />
                    <span className="fw-semibold" style={{ color: "#FB8C00" }}>220 kV</span>
                    <span className="text-muted ms-auto">(Transmission)</span>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ width: "16px", height: "4px", backgroundColor: "#1E88E5", display: "inline-block", borderRadius: "2px" }} />
                    <span className="fw-semibold" style={{ color: "#1E88E5" }}>132 kV</span>
                    <span className="text-muted ms-auto">(Sub-transmission)</span>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ width: "10px", height: "10px", backgroundColor: "#D97706", display: "inline-block", borderRadius: "50%", border: "1.5px solid #fff" }} />
                    <span className="fw-semibold">Power Plant</span>
                    <span className="text-muted ms-auto">(Thermal/Hydro)</span>
                  </div>
                </div>
              </div>

              {/* Identified Substation Floating Card (When a Substation is Selected) */}
              {selectedSubstation && (
                <div
                  className="position-absolute bottom-0 start-0 m-3 bg-white p-3 rounded-3 border shadow-lg"
                  style={{ zIndex: 15, width: "360px", maxWidth: "calc(100% - 30px)" }}
                >
                  <div className="d-flex align-items-start justify-content-between mb-1">
                    <div className="d-flex align-items-center gap-2">
                      <span
                        className="badge"
                        style={{
                          backgroundColor:
                            selectedSubstation.voltageClass >= 400
                              ? "#DC2626"
                              : selectedSubstation.voltageClass === 220
                              ? "#EA580C"
                              : "#2563EB",
                          color: "#FFF",
                        }}
                      >
                        {selectedSubstation.voltage}
                      </span>
                      <span className="badge bg-secondary-subtle text-secondary">
                        {selectedSubstation.operator}
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedSubstation(null)}
                      className="btn-close btn-sm"
                      aria-label="Close"
                    />
                  </div>

                  <h5 className="fw-bold text-dark mt-2 mb-1">
                    {selectedSubstation.name}
                  </h5>

                  <div className="d-flex align-items-center gap-3 text-muted small mb-2">
                    <span className="d-flex align-items-center gap-1">
                      <MapPin size={13} className="text-danger" />
                      {selectedSubstation.district}
                    </span>
                    <span>
                      {selectedSubstation.lat.toFixed(4)}°N, {selectedSubstation.lon.toFixed(4)}°E
                    </span>
                  </div>

                  <p className="text-secondary small mb-3">
                    {selectedSubstation.description}
                  </p>

                  <div className="d-flex gap-2">
                    <a
                      href={`https://openinframap.org/#14/${selectedSubstation.lat}/${selectedSubstation.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline-primary btn-sm flex-grow-1 d-flex align-items-center justify-content-center gap-1"
                    >
                      <ExternalLink size={13} />
                      View in OpenInfraMap
                    </a>
                    <a
                      href={`https://www.openstreetmap.org/#map=16/${selectedSubstation.lat}/${selectedSubstation.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center gap-1"
                      title="Open in OpenStreetMap"
                    >
                      <Shield size={13} />
                      OSM
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Basemap Settings & API Key Configuration Modal */}
        {keyModalOpen && (
          <div
            className="modal show d-block"
            tabIndex="-1"
            style={{ backgroundColor: "rgba(15, 23, 42, 0.65)", zIndex: 1050 }}
          >
            <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "560px" }}>
              <div className="modal-content shadow-lg border-0 rounded-3">
                <div className="modal-header bg-light border-bottom px-4 py-3">
                  <div className="d-flex align-items-center gap-2">
                    <Key size={18} className="text-primary" />
                    <h5 className="modal-title fw-bold text-dark m-0 fs-6">
                      Basemap Styles & API Key Settings
                    </h5>
                  </div>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setKeyModalOpen(false)}
                  />
                </div>

                <div className="modal-body p-4">
                  <div className="alert alert-info border-0 rounded-2 p-3 mb-3" style={{ fontSize: "12.5px" }}>
                    <div className="fw-bold mb-1 d-flex align-items-center gap-1 text-primary">
                      <Info size={15} />
                      Why did CARTO show "API KEY REQUIRED"?
                    </div>
                    <div>
                      CARTO recently updated their policy to require an authentication key on direct tile requests (<code>basemaps.cartocdn.com</code>).
                    </div>
                    <div className="mt-2 text-dark">
                      ✅ <b>Instant Solution (No Key Required):</b> The RTG Portal includes built-in <b>OpenStreetMap Standard</b>, <b>Esri Light Gray Canvas</b>, and <b>Satellite Imagery</b> which are 100% free and require <b>NO API KEY</b> and have <b>NO watermark</b>.
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold small text-dark d-flex align-items-center justify-content-between">
                      <span>Optional CARTO Basemap API Key</span>
                      <a
                        href="https://carto.com/basemaps/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-decoration-none small d-flex align-items-center gap-1 text-primary"
                      >
                        <span>Get Free Key (5M req/mo)</span>
                        <ExternalLink size={12} />
                      </a>
                    </label>
                    <div className="input-group input-group-sm">
                      <input
                        type="text"
                        className="form-control font-monospace"
                        placeholder="Paste CARTO API key (e.g. carto-pub-...) or leave blank"
                        value={tempKeyInput}
                        onChange={(e) => setTempKeyInput(e.target.value)}
                      />
                      {tempKeyInput && (
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => setTempKeyInput("")}
                          title="Clear input"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <div className="form-text text-muted" style={{ fontSize: "11px" }}>
                      Key is securely saved in your local browser storage and automatically appended as <code>?key=YOUR_KEY</code>.
                    </div>
                  </div>

                  <div className="border rounded-2 p-2 bg-light">
                    <div className="fw-bold text-muted text-uppercase mb-2" style={{ fontSize: "10px" }}>
                      Available Basemap Options
                    </div>
                    <div className="d-flex flex-column gap-1">
                      {BASEMAP_PROVIDERS.map((bm) => (
                        <div
                          key={bm.id}
                          className="d-flex align-items-center justify-content-between p-1 px-2 rounded bg-white border"
                          style={{ fontSize: "11.5px" }}
                        >
                          <div>
                            <span className="fw-bold text-dark">{bm.label}</span>
                            <span className="text-muted ms-2 small">{bm.description}</span>
                          </div>
                          <span
                            className={`badge ${
                              bm.requiresKey
                                ? cartoApiKey
                                  ? "bg-success-subtle text-success"
                                  : "bg-warning-subtle text-warning border"
                                : "bg-success-subtle text-success"
                            }`}
                          >
                            {bm.requiresKey ? (cartoApiKey ? "Key Ready" : "Key Req.") : "No Key Req."}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="modal-footer bg-light border-top px-4 py-2 d-flex justify-content-between">
                  <div>
                    {cartoApiKey && (
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={handleClearCartoKey}
                      >
                        Remove Saved Key
                      </button>
                    )}
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => {
                        setActiveBaseMap("osm");
                        setKeyModalOpen(false);
                      }}
                    >
                      Use Free OSM Basemap
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm fw-bold px-3"
                      onClick={handleSaveCartoKey}
                    >
                      {tempKeyInput.trim() ? "Save Key & Apply CARTO" : "Save Settings"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legal & Attribution Footer */}
        <div className="mt-2 p-2 bg-white rounded-3 border text-center text-muted" style={{ fontSize: "11px" }}>
          Power system geospatial layers provided by{" "}
          <a
            href="https://openinframap.org/#7.64/22.21/87.641"
            target="_blank"
            rel="noopener noreferrer"
            className="text-decoration-underline text-secondary fw-semibold"
          >
            Open Infrastructure Map
          </a>{" "}
          • Map engine powered by{" "}
          <a
            href="https://maplibre.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-decoration-underline text-secondary fw-semibold"
          >
            MapLibre GL JS
          </a>{" "}
          • Map data ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="text-decoration-underline text-secondary fw-semibold"
          >
            OpenStreetMap contributors
          </a>{" "}
          (ODbL License).
        </div>
      </main>
    </div>
  );
}
