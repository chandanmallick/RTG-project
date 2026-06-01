# utils/processor.py

import pandas as pd
import requests
import ssl
import urllib3
from config import settings


class CustomHttpAdapter(requests.adapters.HTTPAdapter):
    def __init__(self, ssl_context=None, **kwargs):
        self.ssl_context = ssl_context
        super().__init__(**kwargs)

    def init_poolmanager(self, connections, maxsize, block=False):
        self.poolmanager = urllib3.poolmanager.PoolManager(
            num_pools=connections,
            maxsize=maxsize,
            block=block,
            ssl_context=self.ssl_context
        )


def get_legacy_session():
    ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
    ctx.options |= 0x4
    session = requests.session()
    session.mount('https://', CustomHttpAdapter(ctx))
    return session


class DataProcessor:

    @staticmethod
    def run_pipeline():

        session = get_legacy_session()

        # =========================
        # FETCH
        # =========================
        stations_df = pd.DataFrame(session.get(settings.STATIONS_API).json())
        units_df = pd.DataFrame.from_records(session.get(settings.UNITS_API).json())

        units_df = units_df[units_df.ACTIVE == 1]

        stations_df = stations_df[[
            "Id", "OtherSectionFlag", "Generating_Station_Name",
            "Location", "FuelName", "Station_Type_Name",
            "CLASSIFICATION_ID", "Classification_Name"
        ]]
        stations_df = stations_df.rename(columns={"Id": "STATION_ID"})

        # =========================
        # STAGES
        # =========================
        stages_df = pd.DataFrame()
        for _, row in stations_df.iterrows():
            stage_df = pd.DataFrame.from_records(
                session.get(settings.STAGES_API.format(row['STATION_ID'])).json()
            )
            stage_df["STATION_ID"] = row['STATION_ID']
            stages_df = pd.concat([stages_df, stage_df])

        stages_df = stages_df.rename(columns={"ID": "STAGE_ID"})
        stages_df = stages_df[['STATION_ID', 'STAGE_ID', 'STAGE_NAME', 'FK_GENERATING_STATION']]

        # =========================
        # UNITS
        # =========================
        units_df = units_df[[
            'Id', 'Generating_Station', 'Stage', 'Unit_Number',
            'Unit_Name', 'Mva_Capacity', 'Installed_Capacity',
            'Derated_Capacity', 'LOCATION_ID',
            'AUXILARY_CONSUMPTION', 'VARIABLE_COST',
            'IsInFirm', 'FK_REPORTING_STAGE', 'ACTIVE'
        ]]

        units_df = units_df.rename(columns={
            "Stage": "STAGE_ID",
            "Generating_Station": "STATION_ID"
        })

        station_stage_df = stages_df.set_index('STATION_ID').join(
            stations_df.set_index('STATION_ID')
        )

        units_Stage_Station_df = units_df.set_index('STAGE_ID').join(
            station_stage_df.set_index('STAGE_ID')
        )

        units_Stage_Station_df.CLASSIFICATION_ID = units_Stage_Station_df.CLASSIFICATION_ID.replace(settings.CLASS_MAP)

        # =========================
        # OWNER LOGIC (UNCHANGED)
        # =========================
        gen_list = pd.DataFrame.from_records(session.get(settings.GEN_LIST_API).json())
        elem_list = pd.DataFrame.from_records(session.get(settings.ELEM_LIST_API).json())
        owner_list = pd.DataFrame.from_records(session.get(settings.OWNER_LIST_API).json())

        owner_list = owner_list[["Id", "Owner_Name"]]
        gen_list = gen_list.set_index('Id')
        elem_list = elem_list.set_index('Child_Entity_Attribute_Id')
        owner_list = owner_list.set_index('Id')

        elem_list = elem_list.join(owner_list).reset_index()
        elem_list = elem_list.set_index('Parent_Entity_Attribute_Id')

        elem_list = elem_list[
            (elem_list.Parent_Entity == 'GENERATING_STATION') &
            (elem_list.Parent_Entity_Attribute == 'Owner')
        ]

        gen_list = gen_list.join(elem_list)

        gen_list_owner = gen_list[[
            'Generating_Station_Name', 'No_Of_Units',
            'Installed_Capacity', 'Effective_Capacity',
            'State_Name', 'Owner_Name', 'Station_Type_Name'
        ]]

        units_Stage_Station_df = units_Stage_Station_df.reset_index().set_index('Generating_Station_Name')

        final_df = units_Stage_Station_df.join(
            gen_list_owner.set_index('Generating_Station_Name'),
            rsuffix="_"
        )

        final_df = final_df.rename(columns=settings.RENAME_MAP)

        final_df["plant_id"] = final_df.FK_REPORTING_STAGE.astype(str).str.zfill(5).map("RTG_ER{}".format)
        final_df["region_name"] = "ERLDC"
        final_df["effective_capacity"] = final_df.installed_capacity

        final_df = final_df.drop(columns=['Station_Type_Name_', 'Classification_Name', 'effective_capacity'])

        return final_df.reset_index()