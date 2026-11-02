import json
from pathlib import Path

# Coordinate references for West Bengal grid nodes
NODES = {
    # Generating Stations
    "kolaghat_tps": {"name": "Kolaghat TPS", "coords": [87.8732, 22.4287], "type": "plant", "fuel": "coal", "cap": 1260, "units": "6x210 MW", "op": "WBPDCL", "volt": "400/220/132 kV", "vclass": 400, "dist": "Purba Medinipur"},
    "bakreswar_tps": {"name": "Bakreswar TPS", "coords": [87.4522, 23.8284], "type": "plant", "fuel": "coal", "cap": 1050, "units": "5x210 MW", "op": "WBPDCL", "volt": "400/220 kV", "vclass": 400, "dist": "Birbhum"},
    "sagardighi_tps": {"name": "Sagardighi TPS", "coords": [88.0962, 24.3644], "type": "plant", "fuel": "coal", "cap": 1600, "units": "2x300 MW + 2x500 MW", "op": "WBPDCL", "volt": "400/220 kV", "vclass": 400, "dist": "Murshidabad"},
    "santaldih_tps": {"name": "Santaldih TPS", "coords": [86.4674, 23.5982], "type": "plant", "fuel": "coal", "cap": 500, "units": "2x250 MW", "op": "WBPDCL", "volt": "400/220 kV", "vclass": 400, "dist": "Purulia"},
    "farakka_stps": {"name": "Farakka STPS", "coords": [87.9053, 24.7781], "type": "plant", "fuel": "coal", "cap": 2100, "units": "3x200 MW + 3x500 MW", "op": "NTPC", "volt": "400/220 kV", "vclass": 400, "dist": "Murshidabad"},
    "bandel_tps": {"name": "Bandel TPS", "coords": [88.4052, 22.9961], "type": "plant", "fuel": "coal", "cap": 215, "units": "1x215 MW (Unit 5)", "op": "WBPDCL", "volt": "220/132 kV", "vclass": 220, "dist": "Hooghly"},
    "mejia_mtps": {"name": "Mejia Thermal Power Station (MTPS)", "coords": [87.1321, 23.4542], "type": "plant", "fuel": "coal", "cap": 2340, "units": "4x210 MW + 2x250 MW + 2x500 MW", "op": "DVC", "volt": "400/220 kV", "vclass": 400, "dist": "Bankura"},
    "dpl_durgapur": {"name": "Durgapur Projects Ltd (DPL)", "coords": [87.3242, 23.5186], "type": "plant", "fuel": "coal", "cap": 550, "units": "1x300 MW + 1x250 MW", "op": "WBPDCL", "volt": "220/132 kV", "vclass": 220, "dist": "Paschim Bardhaman"},
    "dstps_andal": {"name": "Durgapur Steel TPS (DSTPS)", "coords": [87.3015, 23.4682], "type": "plant", "fuel": "coal", "cap": 1000, "units": "2x500 MW", "op": "DVC", "volt": "400 kV", "vclass": 400, "dist": "Paschim Bardhaman"},
    "budge_budge": {"name": "Budge Budge Generating Station", "coords": [88.1750, 22.4770], "type": "plant", "fuel": "coal", "cap": 750, "units": "3x250 MW", "op": "CESC", "volt": "220 kV", "vclass": 220, "dist": "South 24 Parganas"},
    "titagarh_gs": {"name": "Titagarh Generating Station", "coords": [88.3752, 22.7381], "type": "plant", "fuel": "coal", "cap": 240, "units": "4x60 MW", "op": "CESC", "volt": "220/132 kV", "vclass": 220, "dist": "North 24 Parganas"},
    "southern_gs": {"name": "Southern Generating Station", "coords": [88.3054, 22.5492], "type": "plant", "fuel": "coal", "cap": 135, "units": "2x67.5 MW", "op": "CESC", "volt": "132 kV", "vclass": 132, "dist": "Kolkata"},
    "purulia_ppsp": {"name": "Purulia Pumped Storage Project (PPSP)", "coords": [86.1774, 23.2012], "type": "plant", "fuel": "hydro", "cap": 900, "units": "4x225 MW Pumped Storage", "op": "WBSEDCL", "volt": "400 kV", "vclass": 400, "dist": "Purulia"},
    "tldp_hydro": {"name": "Teesta Low Dam III & IV Hydro", "coords": [88.4350, 27.0250], "type": "plant", "fuel": "hydro", "cap": 292, "units": "4x33 MW + 4x40 MW", "op": "NHPC", "volt": "220/132 kV", "vclass": 220, "dist": "Kalimpong / Darjeeling"},
    "rammam_hydro": {"name": "Rammam Stage-II Hydro", "coords": [88.1920, 27.1260], "type": "plant", "fuel": "hydro", "cap": 51, "units": "4x12.75 MW", "op": "WBSEDCL", "volt": "132 kV", "vclass": 132, "dist": "Darjeeling"},
    "jaldhaka_hydro": {"name": "Jaldhaka Hydroelectric Project", "coords": [88.8710, 27.0120], "type": "plant", "fuel": "hydro", "cap": 36, "units": "Stages I & II", "op": "WBSEDCL", "volt": "66/132 kV", "vclass": 132, "dist": "Kalimpong"},
    "rtps_dvc": {"name": "Raghunathpur Thermal Power Station", "coords": [86.6850, 23.6350], "type": "plant", "fuel": "coal", "cap": 1200, "units": "2x600 MW", "op": "DVC", "volt": "400 kV", "vclass": 400, "dist": "Purulia"},
    "mpl_maithon": {"name": "Maithon Right Bank Power Plant (MPL)", "coords": [86.7620, 23.7740], "type": "plant", "fuel": "coal", "cap": 1050, "units": "2x525 MW", "op": "Tata Power / DVC", "volt": "400 kV", "vclass": 400, "dist": "Inter-State Border"},

    # 400 kV & 765 kV Substations
    "jeenat_sub": {"name": "Jeenat 400/220 kV Substation", "coords": [87.5000, 23.9000], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "WBSETCL", "dist": "Birbhum"},
    "rajarhat_sub": {"name": "Rajarhat 400/220 kV GIS Substation", "coords": [88.4870, 22.5830], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "POWERGRID", "dist": "North 24 Parganas"},
    "subhasgram_sub": {"name": "Subhasgram 400/220 kV Substation", "coords": [88.4120, 22.4180], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "POWERGRID", "dist": "South 24 Parganas"},
    "durgapur_pg": {"name": "Durgapur 400/220 kV Substation (PG)", "coords": [87.3180, 23.5050], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "POWERGRID", "dist": "Paschim Bardhaman"},
    "gokarna_sub": {"name": "Gokarna 400/220 kV Substation", "coords": [88.1790, 24.0380], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "WBSETCL", "dist": "Murshidabad"},
    "arambagh_sub": {"name": "Arambagh 400/220 kV Substation", "coords": [87.7810, 22.8850], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "WBSETCL", "dist": "Hooghly"},
    "burdwan_paraj": {"name": "Burdwan (Paraj) 400/220 kV Substation", "coords": [87.6520, 23.3980], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "WBSETCL", "dist": "Purba Bardhaman"},
    "bishnupur_sub": {"name": "Bishnupur 400/220 kV Substation", "coords": [87.3200, 23.0800], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "WBSETCL", "dist": "Bankura"},
    "midnapore_765": {"name": "Midnapore (Kharagpur) 765/400 kV Substation", "coords": [87.3170, 22.4040], "type": "substation", "volt": "765/400 kV", "vclass": 765, "op": "POWERGRID", "dist": "Paschim Medinipur"},
    "malda_pg": {"name": "Malda 400/220/132 kV Substation", "coords": [88.1380, 25.0420], "type": "substation", "volt": "400/220/132 kV", "vclass": 400, "op": "POWERGRID", "dist": "Malda"},
    "siliguri_pg": {"name": "Siliguri 400/220 kV Substation", "coords": [88.3890, 26.7020], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "POWERGRID", "dist": "Jalpaiguri"},
    "alipurduar_hvdc": {"name": "Alipurduar 400/220 kV & ±800kV HVDC Terminal", "coords": [89.5310, 26.4950], "type": "substation", "volt": "400/220 kV & ±800kV HVDC", "vclass": 765, "op": "POWERGRID", "dist": "Alipurduar"},
    "maithon_pg": {"name": "Maithon 400/220 kV Substation", "coords": [86.8040, 23.7910], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "POWERGRID / DVC", "dist": "Border Area"},
    "jeerat_sub": {"name": "Jeerat 400/220 kV Substation", "coords": [88.4200, 23.0600], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "WBSETCL", "dist": "Hooghly"},

    # 220 kV & 132 kV Substations
    "haldia_sub": {"name": "Haldia 220/132 kV Substation", "coords": [88.0770, 22.0640], "type": "substation", "volt": "220/132 kV", "vclass": 220, "op": "WBSETCL", "dist": "Purba Medinipur"},
    "kasba_sub": {"name": "Kasba 220/132 kV Substation", "coords": [88.3910, 22.5110], "type": "substation", "volt": "220/132 kV", "vclass": 220, "op": "WBSETCL", "dist": "Kolkata"},
    "barasat_sub": {"name": "Barasat 220/132 kV Substation", "coords": [88.4830, 22.7230], "type": "substation", "volt": "220/132 kV", "vclass": 220, "op": "WBSETCL", "dist": "North 24 Parganas"},
    "howrah_sub": {"name": "Howrah 220/132 kV Substation", "coords": [88.2670, 22.5930], "type": "substation", "volt": "220/132 kV", "vclass": 220, "op": "WBSETCL", "dist": "Howrah"},
    "rishra_sub": {"name": "Rishra 220/132 kV Substation", "coords": [88.3410, 22.7120], "type": "substation", "volt": "220/132 kV", "vclass": 220, "op": "WBSETCL", "dist": "Hooghly"},
    "berhampore_sub": {"name": "Berhampore 220/132 kV Substation", "coords": [88.2500, 24.1000], "type": "substation", "volt": "220/132 kV", "vclass": 220, "op": "WBSETCL", "dist": "Murshidabad"},
    "asansol_sub": {"name": "Asansol 220/132 kV Substation", "coords": [86.9660, 23.6880], "type": "substation", "volt": "220/132 kV", "vclass": 220, "op": "DVC", "dist": "Paschim Bardhaman"},
    "kharagpur_wb": {"name": "Kharagpur 220/132 kV Substation (WB)", "coords": [87.3200, 22.3400], "type": "substation", "volt": "220/132 kV", "vclass": 220, "op": "WBSETCL", "dist": "Paschim Medinipur"},
    "purulia_town_sub": {"name": "Purulia Town 220/132 kV Substation", "coords": [86.3600, 23.3300], "type": "substation", "volt": "220/132 kV", "vclass": 220, "op": "WBSETCL", "dist": "Purulia"},
    "fulbari_siliguri": {"name": "Siliguri (Fulbari) 220/132 kV Substation", "coords": [88.4200, 26.6500], "type": "substation", "volt": "220/132 kV", "vclass": 220, "op": "WBSETCL", "dist": "Jalpaiguri"},
    "kurseong_sub": {"name": "Kurseong 132/66 kV Substation", "coords": [88.2800, 26.8800], "type": "substation", "volt": "132/66 kV", "vclass": 132, "op": "WBSETCL", "dist": "Darjeeling"},

    # External grid interconnections
    "ranchi_765": {"name": "Ranchi 765/400 kV Substation (Jharkhand)", "coords": [85.3200, 23.3400], "type": "substation", "volt": "765/400 kV", "vclass": 765, "op": "POWERGRID", "dist": "Inter-State (JH)"},
    "chaibasa_765": {"name": "Chaibasa 765/400 kV Substation (Jharkhand)", "coords": [85.8100, 22.5500], "type": "substation", "volt": "765/400 kV", "vclass": 765, "op": "POWERGRID", "dist": "Inter-State (JH)"},
    "baripada_400": {"name": "Baripada 400/220 kV Substation (Odisha)", "coords": [86.7200, 21.9300], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "POWERGRID / OPTCL", "dist": "Inter-State (OD)"},
    "rangpo_400": {"name": "Rangpo 400/220 kV Substation (Sikkim)", "coords": [88.5280, 27.1750], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "POWERGRID", "dist": "Inter-State (SK)"},
    "bongaigaon_400": {"name": "Bongaigaon 400/220 kV Substation (Assam)", "coords": [90.5600, 26.4800], "type": "substation", "volt": "400/220 kV", "vclass": 400, "op": "POWERGRID", "dist": "Inter-State (AS)"},
    "kahalgaon_400": {"name": "Kahalgaon 400 kV Switchyard (Bihar)", "coords": [87.2300, 25.2600], "type": "substation", "volt": "400 kV", "vclass": 400, "op": "NTPC", "dist": "Inter-State (BR)"},
    "bhutan_tala": {"name": "Tala Hydro Switchyard (Bhutan)", "coords": [89.8700, 27.0500], "type": "substation", "volt": "400 kV", "vclass": 400, "op": "BPC / Bhutan", "dist": "Cross-Border (Bhutan)"},
    "bheramara_hvdc": {"name": "Bheramara 400 kV / HVDC Station (Bangladesh)", "coords": [88.9900, 24.0300], "type": "substation", "volt": "400 kV & HVDC", "vclass": 400, "op": "PGCB / Bangladesh", "dist": "Cross-Border (BD)"},
}

# Major Transmission Corridors linking the nodes
TRANSMISSION_LINES = [
    # 765 kV / ±800 kV HVDC Corridors
    {"from": "midnapore_765", "to": "ranchi_765", "name": "Midnapore - Ranchi 765 kV D/C", "volt": 765000, "circuits": 2, "op": "POWERGRID", "type": "overhead"},
    {"from": "midnapore_765", "to": "chaibasa_765", "name": "Midnapore - Chaibasa 765 kV D/C", "volt": 765000, "circuits": 2, "op": "POWERGRID", "type": "overhead"},
    {"from": "alipurduar_hvdc", "to": "bongaigaon_400", "name": "Alipurduar - Biswanath Chariali ±800 kV HVDC Link", "volt": 800000, "circuits": 2, "op": "POWERGRID", "type": "hvdc"},

    # 400 kV Major Corridors - South Bengal
    {"from": "kolaghat_tps", "to": "jeerat_sub", "name": "Kolaghat TPS - Jeerat 400 kV D/C", "volt": 400000, "circuits": 2, "op": "WBSETCL", "type": "overhead"},
    {"from": "kolaghat_tps", "to": "baripada_400", "name": "Kolaghat TPS - Baripada 400 kV D/C", "volt": 400000, "circuits": 2, "op": "POWERGRID", "type": "overhead"},
    {"from": "kolaghat_tps", "to": "midnapore_765", "name": "Kolaghat TPS - Midnapore 400 kV D/C", "volt": 400000, "circuits": 2, "op": "WBSETCL", "type": "overhead"},
    {"from": "kolaghat_tps", "to": "arambagh_sub", "name": "Kolaghat TPS - Arambagh 400 kV Line", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "kolaghat_tps", "to": "subhasgram_sub", "name": "Kolaghat - Subhasgram 400 kV Corridor", "volt": 400000, "circuits": 1, "op": "POWERGRID", "type": "overhead"},
    {"from": "rajarhat_sub", "to": "subhasgram_sub", "name": "Rajarhat - Subhasgram 400 kV D/C", "volt": 400000, "circuits": 2, "op": "POWERGRID", "type": "overhead"},
    {"from": "rajarhat_sub", "to": "jeerat_sub", "name": "Rajarhat - Jeerat 400 kV D/C", "volt": 400000, "circuits": 2, "op": "POWERGRID", "type": "overhead"},
    {"from": "arambagh_sub", "to": "burdwan_paraj", "name": "Arambagh - Burdwan (Paraj) 400 kV Line", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "arambagh_sub", "to": "bishnupur_sub", "name": "Arambagh - Bishnupur 400 kV Line", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "bishnupur_sub", "to": "midnapore_765", "name": "Bishnupur - Midnapore 400 kV Line", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},

    # 400 kV Major Corridors - Central & West Bengal Generation Evacuation
    {"from": "bakreswar_tps", "to": "jeenat_sub", "name": "Bakreswar TPS - Jeenat 400 kV D/C", "volt": 400000, "circuits": 2, "op": "WBSETCL", "type": "overhead"},
    {"from": "bakreswar_tps", "to": "durgapur_pg", "name": "Bakreswar TPS - Durgapur (PG) 400 kV", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "bakreswar_tps", "to": "burdwan_paraj", "name": "Bakreswar TPS - Burdwan (Paraj) 400 kV", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "jeenat_sub", "to": "gokarna_sub", "name": "Jeenat - Gokarna 400 kV D/C", "volt": 400000, "circuits": 2, "op": "WBSETCL", "type": "overhead"},
    {"from": "jeenat_sub", "to": "durgapur_pg", "name": "Jeenat - Durgapur 400 kV Link", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "jeenat_sub", "to": "burdwan_paraj", "name": "Jeenat - Burdwan (Paraj) 400 kV", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "sagardighi_tps", "to": "gokarna_sub", "name": "Sagardighi TPS - Gokarna 400 kV D/C", "volt": 400000, "circuits": 2, "op": "WBSETCL", "type": "overhead"},
    {"from": "sagardighi_tps", "to": "farakka_stps", "name": "Sagardighi TPS - Farakka 400 kV Line", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "sagardighi_tps", "to": "jeenat_sub", "name": "Sagardighi TPS - Jeenat 400 kV Line", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "farakka_stps", "to": "malda_pg", "name": "Farakka STPS - Malda 400 kV D/C (Ganges Crossing)", "volt": 400000, "circuits": 2, "op": "POWERGRID", "type": "overhead"},
    {"from": "farakka_stps", "to": "kahalgaon_400", "name": "Farakka STPS - Kahalgaon 400 kV Tie", "volt": 400000, "circuits": 1, "op": "NTPC", "type": "overhead"},
    {"from": "farakka_stps", "to": "jeenat_sub", "name": "Farakka STPS - Jeenat 400 kV", "volt": 400000, "circuits": 1, "op": "POWERGRID", "type": "overhead"},
    {"from": "durgapur_pg", "to": "maithon_pg", "name": "Durgapur (PG) - Maithon 400 kV D/C", "volt": 400000, "circuits": 2, "op": "POWERGRID", "type": "overhead"},
    {"from": "mejia_mtps", "to": "maithon_pg", "name": "Mejia MTPS - Maithon 400 kV D/C", "volt": 400000, "circuits": 2, "op": "DVC", "type": "overhead"},
    {"from": "mejia_mtps", "to": "arambagh_sub", "name": "Mejia MTPS - Arambagh 400 kV Line", "volt": 400000, "circuits": 1, "op": "DVC / WBSETCL", "type": "overhead"},
    {"from": "dstps_andal", "to": "durgapur_pg", "name": "DSTPS (Andal) - Durgapur (PG) 400 kV", "volt": 400000, "circuits": 2, "op": "DVC", "type": "overhead"},
    {"from": "santaldih_tps", "to": "rtps_dvc", "name": "Santaldih TPS - Raghunathpur 400 kV", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "santaldih_tps", "to": "durgapur_pg", "name": "Santaldih TPS - Durgapur 400 kV", "volt": 400000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "purulia_ppsp", "to": "arambagh_sub", "name": "Purulia PPSP - Arambagh 400 kV D/C", "volt": 400000, "circuits": 2, "op": "WBSEDCL", "type": "overhead"},
    {"from": "purulia_ppsp", "to": "bakreswar_tps", "name": "Purulia PPSP - Bakreswar 400 kV Line", "volt": 400000, "circuits": 1, "op": "WBSEDCL", "type": "overhead"},
    {"from": "mpl_maithon", "to": "maithon_pg", "name": "Maithon Right Bank (MPL) - Maithon 400 kV", "volt": 400000, "circuits": 2, "op": "MPL", "type": "overhead"},

    # 400 kV Major Corridors - North Bengal & Inter-State / Cross-Border Ties
    {"from": "malda_pg", "to": "siliguri_pg", "name": "Malda - Siliguri 400 kV D/C Arterial", "volt": 400000, "circuits": 2, "op": "POWERGRID", "type": "overhead"},
    {"from": "siliguri_pg", "to": "rangpo_400", "name": "Siliguri - Rangpo (Teesta-V) 400 kV D/C", "volt": 400000, "circuits": 2, "op": "POWERGRID", "type": "overhead"},
    {"from": "siliguri_pg", "to": "alipurduar_hvdc", "name": "Siliguri - Alipurduar 400 kV D/C", "volt": 400000, "circuits": 2, "op": "POWERGRID", "type": "overhead"},
    {"from": "alipurduar_hvdc", "to": "bongaigaon_400", "name": "Alipurduar - Bongaigaon 400 kV D/C", "volt": 400000, "circuits": 2, "op": "POWERGRID", "type": "overhead"},
    {"from": "alipurduar_hvdc", "to": "bhutan_tala", "name": "Alipurduar - Tala (Bhutan Cross-Border) 400 kV D/C", "volt": 400000, "circuits": 2, "op": "POWERGRID / BPC", "type": "overhead"},
    {"from": "berhampore_sub", "to": "bheramara_hvdc", "name": "Berhampore - Bheramara 400 kV Bangladesh Interconnection", "volt": 400000, "circuits": 2, "op": "POWERGRID / PGCB", "type": "overhead"},

    # 220 kV Major Feeder Rings & Generation Evacuation
    {"from": "kolaghat_tps", "to": "haldia_sub", "name": "Kolaghat TPS - Haldia 220 kV D/C", "volt": 220000, "circuits": 2, "op": "WBSETCL", "type": "overhead"},
    {"from": "kolaghat_tps", "to": "howrah_sub", "name": "Kolaghat TPS - Howrah 220 kV D/C", "volt": 220000, "circuits": 2, "op": "WBSETCL", "type": "overhead"},
    {"from": "kolaghat_tps", "to": "rishra_sub", "name": "Kolaghat TPS - Rishra 220 kV Line", "volt": 220000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "budge_budge", "to": "kasba_sub", "name": "Budge Budge - Kasba 220 kV D/C", "volt": 220000, "circuits": 2, "op": "CESC", "type": "overhead"},
    {"from": "budge_budge", "to": "howrah_sub", "name": "Budge Budge - Howrah 220 kV Line", "volt": 220000, "circuits": 1, "op": "CESC", "type": "overhead"},
    {"from": "subhasgram_sub", "to": "kasba_sub", "name": "Subhasgram - Kasba 220 kV Feed", "volt": 220000, "circuits": 2, "op": "WBSETCL", "type": "overhead"},
    {"from": "bandel_tps", "to": "rishra_sub", "name": "Bandel TPS - Rishra 220 kV Line", "volt": 220000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "titagarh_gs", "to": "barasat_sub", "name": "Titagarh - Barasat 220 kV Feed", "volt": 220000, "circuits": 1, "op": "CESC / WBSETCL", "type": "overhead"},
    {"from": "barasat_sub", "to": "rajarhat_sub", "name": "Barasat - Rajarhat 220 kV Tie", "volt": 220000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "dpl_durgapur", "to": "durgapur_pg", "name": "DPL Durgapur - Durgapur (PG) 220 kV", "volt": 220000, "circuits": 2, "op": "WBSETCL", "type": "overhead"},
    {"from": "durgapur_pg", "to": "asansol_sub", "name": "Durgapur - Asansol 220 kV Line", "volt": 220000, "circuits": 2, "op": "DVC", "type": "overhead"},
    {"from": "midnapore_765", "to": "kharagpur_wb", "name": "Midnapore - Kharagpur (WB) 220 kV", "volt": 220000, "circuits": 2, "op": "WBSETCL", "type": "overhead"},
    {"from": "santaldih_tps", "to": "purulia_town_sub", "name": "Santaldih - Purulia Town 220 kV Line", "volt": 220000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "gokarna_sub", "to": "berhampore_sub", "name": "Gokarna - Berhampore 220 kV Line", "volt": 220000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "siliguri_pg", "to": "fulbari_siliguri", "name": "Siliguri (PG) - Fulbari 220 kV Line", "volt": 220000, "circuits": 2, "op": "WBSETCL", "type": "overhead"},
    {"from": "tldp_hydro", "to": "siliguri_pg", "name": "Teesta Low Dam - Siliguri 220 kV Evacuation", "volt": 220000, "circuits": 2, "op": "NHPC", "type": "overhead"},

    # 132 kV Sub-Transmission Lines
    {"from": "fulbari_siliguri", "to": "kurseong_sub", "name": "Fulbari - Kurseong 132 kV Hill Feeder", "volt": 132000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
    {"from": "rammam_hydro", "to": "kurseong_sub", "name": "Rammam Hydro - Kurseong 132 kV Evacuation", "volt": 132000, "circuits": 1, "op": "WBSEDCL", "type": "overhead"},
    {"from": "jaldhaka_hydro", "to": "siliguri_pg", "name": "Jaldhaka Hydro - Siliguri 132 kV Feed", "volt": 132000, "circuits": 1, "op": "WBSEDCL", "type": "overhead"},
    {"from": "southern_gs", "to": "kasba_sub", "name": "Southern GS - Kasba 132 kV Kolkata Ring", "volt": 132000, "circuits": 2, "op": "CESC", "type": "underground"},
    {"from": "bandel_tps", "to": "howrah_sub", "name": "Bandel - Howrah 132 kV Line", "volt": 132000, "circuits": 1, "op": "WBSETCL", "type": "overhead"},
]

def build_geojson():
    features = []

    # 1. Add Power Plants as Points
    for key, node in NODES.items():
        if node["type"] == "plant":
            features.append({
                "type": "Feature",
                "id": f"plant-{key}",
                "geometry": {
                    "type": "Point",
                    "coordinates": node["coords"]
                },
                "properties": {
                    "id": key,
                    "name": node["name"],
                    "short_name": node["name"].split("(")[0].strip(),
                    "category": "power_plant",
                    "fuel": node["fuel"],
                    "capacity_mw": node["cap"],
                    "capacity_label": f"{node['cap']:,} MW",
                    "units": node.get("units", ""),
                    "operator": node["op"],
                    "voltage": node["volt"],
                    "voltage_class": node["vclass"],
                    "district": node.get("dist", "West Bengal"),
                    "color": "#DC2626" if node["fuel"] == "coal" else "#0284C7",
                    "icon": "flame" if node["fuel"] == "coal" else "droplet",
                }
            })

    # 2. Add Substations as Points
    for key, node in NODES.items():
        if node["type"] == "substation":
            features.append({
                "type": "Feature",
                "id": f"sub-{key}",
                "geometry": {
                    "type": "Point",
                    "coordinates": node["coords"]
                },
                "properties": {
                    "id": key,
                    "name": node["name"],
                    "short_name": node["name"].split("(")[0].strip(),
                    "category": "power_substation",
                    "operator": node["op"],
                    "voltage": node["volt"],
                    "voltage_class": node["vclass"],
                    "district": node.get("dist", "West Bengal"),
                    "color": (
                        "#9333EA" if node["vclass"] >= 765 else
                        "#EF4444" if node["vclass"] >= 400 else
                        "#F97316" if node["vclass"] >= 220 else
                        "#0284C7"
                    ),
                }
            })

    # 3. Add Power Transmission Lines as LineStrings
    for index, line in enumerate(TRANSMISSION_LINES):
        from_node = NODES.get(line["from"])
        to_node = NODES.get(line["to"])
        if not from_node or not to_node:
            continue

        c1 = from_node["coords"]
        c2 = to_node["coords"]

        # If distant, generate slight realistic curvature so lines do not overlap perfectly
        mid_lon = (c1[0] + c2[0]) / 2.0
        mid_lat = (c1[1] + c2[1]) / 2.0
        # Gentle perpendicular offset based on index
        offset_fact = ((index % 3) - 1) * 0.015
        dx = c2[1] - c1[1]
        dy = -(c2[0] - c1[0])
        length = (dx*dx + dy*dy) ** 0.5 or 1.0
        norm_dx = dx / length
        norm_dy = dy / length
        midpoint = [round(mid_lon + norm_dx * offset_fact, 4), round(mid_lat + norm_dy * offset_fact, 4)]

        coords = [c1, midpoint, c2]

        v = line["volt"]
        volt_label = f"{int(v / 1000)} kV"
        vclass = int(v / 1000)

        color = (
            "#9333EA" if v >= 700000 else
            "#EF4444" if v >= 380000 else
            "#F97316" if v >= 200000 else
            "#0284C7" if v >= 100000 else
            "#10B981"
        )

        features.append({
            "type": "Feature",
            "id": f"line-{index+1}",
            "geometry": {
                "type": "LineString",
                "coordinates": coords
            },
            "properties": {
                "id": f"line-{index+1}",
                "name": line["name"],
                "category": "power_line",
                "voltage": v,
                "voltage_label": volt_label,
                "voltage_class": vclass,
                "operator": line["op"],
                "circuits": line.get("circuits", 1),
                "line_type": line.get("type", "overhead"),
                "from_name": from_node["name"],
                "to_name": to_node["name"],
                "color": color,
                "casing_color": "#FFFFFF",
            }
        })

    geojson_data = {
        "type": "FeatureCollection",
        "metadata": {
            "title": "West Bengal Power System Grid Map Dataset",
            "region": "West Bengal",
            "version": "2.0.0",
            "total_power_plants": sum(1 for f in features if f["properties"].get("category") == "power_plant"),
            "total_substations": sum(1 for f in features if f["properties"].get("category") == "power_substation"),
            "total_power_lines": sum(1 for f in features if f["properties"].get("category") == "power_line"),
            "total_generation_capacity_mw": sum(f["properties"].get("capacity_mw", 0) for f in features if f["properties"].get("category") == "power_plant"),
            "source": "curated_wb_grid_dataset",
        },
        "features": features
    }

    output_path = Path(__file__).resolve().parent / "west_bengal_power_grid.geojson"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson_data, f, indent=2)

    print(f"Successfully generated {output_path} with {len(features)} features!")
    print(f"  Power Plants: {geojson_data['metadata']['total_power_plants']}")
    print(f"  Substations:  {geojson_data['metadata']['total_substations']}")
    print(f"  Power Lines:  {geojson_data['metadata']['total_power_lines']}")
    print(f"  Total Gen Capacity: {geojson_data['metadata']['total_generation_capacity_mw']:,} MW")

if __name__ == "__main__":
    build_geojson()

