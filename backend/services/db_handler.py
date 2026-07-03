import pandas as pd
from pymongo import MongoClient
from config.settings import (
    MONGO_URI,
    DB_NAME,
    UNIT_COLLECTION,
    MAP_COLLECTION,
    PIPELINE_CONFIG_COLLECTION,
    PIPELINE_LOG_COLLECTION,
    RTG_DASHBOARD_COLLECTION,
    PSP_COLLECTION,
    MONGO_SERVER_SELECTION_TIMEOUT_MS
)




class MongoService:

    def __init__(self):

        self.client = MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=MONGO_SERVER_SELECTION_TIMEOUT_MS
        )

        self.db = self.client[
            DB_NAME
        ]

        self.collection = self.db[
            UNIT_COLLECTION
        ]

        self.unit_collection = self.db[
            UNIT_COLLECTION
        ]

        self.map_collection = self.db[
            MAP_COLLECTION
        ]

        self.pipeline_config_collection = self.db[
            PIPELINE_CONFIG_COLLECTION
        ]

        self.pipeline_log_collection = self.db[
            PIPELINE_LOG_COLLECTION
        ]

        self.rtg_dashboard_collection = self.db[
            RTG_DASHBOARD_COLLECTION
        ]

        self.psp_collection = self.db[
            PSP_COLLECTION
        ]

        self.nldc_psp_demand_collection = self.db[
            "NLDC_PSP_Demand"
        ]

        self.india_15_min_demand_collection = self.db[
            "India_15_Min_Demand"
        ]

        self.all_state_demand_collection = self.db[
            "All_State_Demand"
        ]

        # Explicitly create the collection if it doesn't exist yet
        if PSP_COLLECTION not in self.db.list_collection_names():
            self.db.create_collection(PSP_COLLECTION)

        if "NLDC_PSP_Demand" not in self.db.list_collection_names():
            self.db.create_collection("NLDC_PSP_Demand")

        if "India_15_Min_Demand" not in self.db.list_collection_names():
            self.db.create_collection("India_15_Min_Demand")

        if "All_State_Demand" not in self.db.list_collection_names():
            self.db.create_collection("All_State_Demand")

        if "frequency_mapping" not in self.db.list_collection_names():
            self.db.create_collection("frequency_mapping")
            if "station_mapping" in self.db.list_collection_names():
                old_docs = list(self.db["station_mapping"].find({}, {"_id": 0}))
                if old_docs:
                    self.db["frequency_mapping"].insert_many(old_docs)

    # 🔥 UPSERT LOGIC (CORE)
    def upsert_data(self, df: pd.DataFrame):

        if df.empty:
            return {"message": "No data to insert"}

        upserted = 0

        for _, row in df.iterrows():

            doc = row.to_dict()

            # 🔑 UNIQUE KEY (IMPORTANT)
            query = {
                "Unit_Number": doc.get("Unit_Number"),
                "plant_id": doc.get("plant_id")
            }

            self.collection.update_one(
                query,
                {"$set": doc},
                upsert=True
            )

            upserted += 1

        return {
            "message": "Upsert completed",
            "records_processed": upserted
        }
    

    # =====================================================
    # BUILD CONSOLIDATED STAGE DATAFRAME
    # =====================================================

    def build_stage_mapping_df(self):

        units = list(self.collection.find({}, {"_id": 0}))

        if not units:
            return pd.DataFrame()

        df = pd.DataFrame(units)


        # -------------------------------------------------
        # GROUP STAGE DATA
        # -------------------------------------------------
        df.to_excel("C:/Users/50041/Downloads/RTG Codebase/RTG Codebase/Outage/Test.xlsx")

        grouped = df.groupby(
            ["plant_id"],
            as_index=False
        ).agg({
            "plant_id": "first",
            "STAGE_ID": "first",
            "STAGE_NAME": "first",
            "Generating_Station_Name": "first",
            "owner_name": "first",
            "state_name": "first",
            "installed_capacity": "sum"
        })

        grouped = grouped.rename(columns={"Generating_Station_Name":"plant_name", "installed_capacity": "stage_installed_capacity"})

        return grouped

    

    # =====================================================
    # COMPARE CONSOLIDATED STAGE MAPPING
    # =====================================================

    def compare_stage_mapping(self, grouped_df):

        existing = list(
            self.map_collection.find({}, {"_id": 0})
        )

        # --------------------------------------------
        # FIRST TIME
        # --------------------------------------------

        if not existing:

            grouped_df["change_type"] = "NEW"

            grouped_df["changed_fields"] = [
                [
                    "plant_name",
                    "STAGE_NAME",
                    "owner_name",
                    "state_name",
                    "stage_installed_capacity"
                ]
            ] * len(grouped_df)

            return grouped_df.to_dict("records")

        existing_df = pd.DataFrame(existing)

        # --------------------------------------------
        # EXISTING MAP
        # --------------------------------------------

        existing_map = {

            str(row["plant_id"]): row

            for _, row in existing_df.iterrows()

        }

        changes = []

        # --------------------------------------------
        # COMPARE EACH STAGE
        # --------------------------------------------

        for _, row in grouped_df.iterrows():

            key = str(row["plant_id"])

            # NEW STAGE
            if key not in existing_map:

                new_row = row.copy()

                new_row["change_type"] = "NEW"

                new_row["changed_fields"] = [

                    "plant_name",
                    "STAGE_NAME",
                    "owner_name",
                    "state_name",
                    "stage_installed_capacity"

                ]

                changes.append(new_row.to_dict())

                continue

            old = existing_map[key]

            changed_fields = []

            compare_fields = [

                "plant_name",
                "STAGE_NAME",
                "owner_name",
                "state_name",
                "stage_installed_capacity"

            ]

            for field in compare_fields:

                new_val = str(
                    row.get(field, "")
                ).strip()

                old_val = str(
                    old.get(field, "")
                ).strip()

                if new_val != old_val:

                    changed_fields.append(field)

            if changed_fields:

                mod_row = row.copy()

                mod_row["change_type"] = "MODIFIED"

                mod_row["changed_fields"] = changed_fields

                changes.append(mod_row.to_dict())

        return changes

        
    # =====================================================
    # SAVE CONSOLIDATED STAGE MAPPING
    # =====================================================

    def commit_stage_mapping(self, grouped_df):

        processed = 0

        for _, row in grouped_df.iterrows():

            doc = row.to_dict()

            existing = self.map_collection.find_one({

                "plant_id":
                    doc["plant_id"]

            })

            # ----------------------------------------
            # PRESERVE USER EDITABLE FIELDS
            # ----------------------------------------

            wbes_name = ""
            scada_key = ""
            outage_key = ""
            wbes_acronym = ""
            scada_schedule_key = ""
            scada_dc_key = ""
            schedule_source = "RTG"
            dc_source = "RTG"
            actual_source = "RTG"
            plant_type = "IPP"
            rtg_plant_id = ""
            is_state = False
            is_frequency = False

            if existing:

                wbes_name = existing.get(
                    "wbes_name", ""
                )

                scada_key = existing.get(
                    "scada_key", ""
                )

                outage_key = existing.get(
                    "outage_key", ""
                )

                wbes_acronym = existing.get(
                    "wbes_acronym", ""
                )

                scada_schedule_key = existing.get(
                    "scada_schedule_key", ""
                )

                scada_dc_key = existing.get(
                    "scada_dc_key", ""
                )

                schedule_source = existing.get(
                    "schedule_source", "RTG"
                )

                dc_source = existing.get(
                    "dc_source", "RTG"
                )

                actual_source = existing.get(
                    "actual_source", "RTG"
                )

                plant_type = existing.get(
                    "type", "IPP"
                )

                rtg_plant_id = existing.get(
                    "rtg_plant_id", ""
                )

                is_state = existing.get(
                    "is_state", False
                )

                is_frequency = existing.get(
                    "is_frequency", False
                )

            # ----------------------------------------
            # FINAL DOC
            # ----------------------------------------

            final_doc = {

                "plant_id":
                    doc["plant_id"],

                "STAGE_ID":
                    doc["STAGE_ID"],

                "STAGE_NAME":
                    doc["STAGE_NAME"],

                "plant_name":
                    doc["plant_name"],

                "owner_name":
                    doc["owner_name"],

                "state_name":
                    doc["state_name"],

                "stage_installed_capacity":
                    doc["stage_installed_capacity"],

                # USER EDITABLE

                "wbes_name":
                    wbes_name,

                "scada_key":
                    scada_key,

                "outage_key":
                    outage_key,

                "wbes_acronym":
                    wbes_acronym,

                "scada_schedule_key":
                    scada_schedule_key,

                "scada_dc_key":
                    scada_dc_key,

                "schedule_source":
                    schedule_source,

                "dc_source":
                    dc_source,

                "actual_source":
                    actual_source,

                "type":
                    plant_type,

                "rtg_plant_id":
                    rtg_plant_id,

                "is_state":
                    is_state,

                "is_frequency":
                    is_frequency
            }

            self.map_collection.update_one(

                {
                    "plant_id":
                        doc["plant_id"]
                },

                {
                    "$set": final_doc
                },

                upsert=True
            )

            processed += 1

        return {

            "success": True,

            "updated": processed
        }



    # =========================================
        # STAGE WISE MAPPING TABLE SYNC
        # =========================================

        def sync_station_mapping(self):

            # =====================================
            # LOAD UNIT MASTER DATA
            # =====================================

            units = list(
                self.collection.find({}, {"_id": 0})
            )

            if not units:

                return {
                    "message": "No unit data found"
                }

            df = pd.DataFrame(units)

            # =====================================
            # GROUP BY PLANT + STAGE
            # =====================================


            grouped = df.groupby(
                ["plant_id"],
                as_index=False
            ).agg({

                "plant_id": "first",
                "STAGE_ID": "first",
                "STAGE_NAME": "first",
                "Generating_Station_Name": "first",
                "owner_name": "first",
                "installed_capacity": "sum"

            })

            grouped = grouped.rename(columns={

                "installed_capacity":
                    "stage_installed_capacity"

            })

            processed = 0

            # =====================================
            # UPSERT MAP TABLE
            # =====================================

            for _, row in grouped.iterrows():

                doc = row.to_dict()

                existing = self.map_collection.find_one({

                    "plant_id": doc["plant_id"],
                    "STAGE_ID": doc["STAGE_ID"]

                })

                # =================================
                # PRESERVE EDITABLE FIELDS
                # =================================

                if existing:

                    mapped_state = existing.get(
                        "mapped_state", ""
                    )

                    sap_code = existing.get(
                        "sap_code", ""
                    )

                    erp_code = existing.get(
                        "erp_code", ""
                    )

                else:

                    mapped_state = ""
                    sap_code = ""
                    erp_code = ""

                # =================================
                # FINAL STAGE RECORD
                # =================================

                mapping_doc = {

                    # 🔹 PRIMARY KEY

                    "plant_id":
                        doc["plant_id"],

                    "STAGE_ID":
                        doc["STAGE_ID"],

                    # 🔹 MASTER FIELDS

                    "STAGE_NAME":
                        doc["STAGE_NAME"],

                    "Generating_Station_Name":
                        doc["Generating_Station_Name"],

                    "owner_name":
                        doc["owner_name"],

                    "stage_installed_capacity":
                        doc["stage_installed_capacity"],

                    # 🔥 EDITABLE FIELDS

                    "mapped_state":
                        mapped_state,

                    "sap_code":
                        sap_code,

                    "erp_code":
                        erp_code
                }

                self.map_collection.update_one(

                    {
                        "plant_id": doc["plant_id"],
                        "STAGE_ID": doc["STAGE_ID"]
                    },

                    {
                        "$set": mapping_doc
                    },

                    upsert=True
                )

                processed += 1

            return {

                "message": "Stage mapping synced",

                "records": processed
            }
