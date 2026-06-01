import pandas as pd
import urllib
import json
import requests
import json
import ssl
import urllib3
import traceback



from datetime import datetime

from services.db_handler import MongoService

from services.pipeline_logger import (PipelineLogger)

from services.pipeline_config_service import (PipelineConfigService)

from services.external_fetch_service import (ExternalFetchService)

from services.token_service import (TokenService)

from services.rtg_push_service import (RTGPushService)


class CustomHttpAdapter(
    requests.adapters.HTTPAdapter
):

    def __init__(
        self,
        ssl_context=None,
        **kwargs
    ):

        self.ssl_context = ssl_context

        super().__init__(**kwargs)

    def init_poolmanager(
        self,
        connections,
        maxsize,
        block=False
    ):

        self.poolmanager = (
            urllib3.poolmanager
            .PoolManager(
                num_pools=connections,
                maxsize=maxsize,
                block=block,
                ssl_context=self.ssl_context
            )
        )


def get_legacy_session():

    ctx = ssl.create_default_context(
        ssl.Purpose.SERVER_AUTH
    )

    ctx.options |= 0x4

    session = requests.session()

    session.mount(
        'https://',
        CustomHttpAdapter(ctx)
    )

    return session


ssl._create_default_https_context = (
    ssl._create_unverified_context
)


class PipelineRunner:

    @staticmethod
    def run_schedule_pipeline():

        logger = PipelineLogger()

        revision_id = (
            "SCHEDULE_"
            + datetime.now().strftime(
                "%Y%m%d_%H%M%S"
            )
        )

        try:

            # =========================================
            # CONFIG
            # =========================================

            config = (
                PipelineConfigService()
                .get_config(
                    "SCHEDULE"
                )
            )

            logger.log(

                revision_id,

                "SCHEDULE",

                "CONFIG",

                "SUCCESS",

                "Pipeline config loaded"
            )

            if not config:

                logger.log(

                    revision_id,

                    "SCHEDULE",

                    "CONFIG",

                    "FAILED",

                    "Pipeline config not found"
                )

                return

            # =========================================
            # MONGO Master Data Fetch
            # =========================================

            db = MongoService()

            collection = db.map_collection

            data = list(
                collection.find(
                    {},
                    {"_id": 0}
                )
            )

            df = pd.DataFrame(data)

            ######## **** Add log for MONGO Master Data Fetch ****

            logger.log(

                revision_id,

                "SCHEDULE",

                "MASTER_FETCH",

                "SUCCESS",

                "Station mapping loaded",

                {
                    "rows":
                        len(df)
                }
            )

            # =========================================
            # WBES FILTER
            # =========================================

            WBES_df = df[
                df["wbes_name"]
                .fillna("")
                .str.strip() != ""
            ]

            wbes_dict = dict(
                zip(
                    WBES_df["wbes_name"],
                    WBES_df["plant_id"]
                )
            )

            generator_list = [

                urllib.parse.quote(i)

                for i in list(
                    wbes_dict.keys()
                )
            ]

            # =========================================
            # FETCH PAYLOAD
            # =========================================

            payload = {

                "Date":
                    datetime.now()
                    .strftime("%d-%m-%Y"),

                "SchdRevNo":
                    -1,

                "UserName":
                    config[
                        "schedule_username"
                    ],

                "UtilAcronymList":
                    generator_list,

                "UtilRegionIdList":
                    [1]
            }

            # =========================================
            # FETCH WBES
            # =========================================

            response = (
                ExternalFetchService
                .fetch_wbes_data(

                    config[
                        "schedule_url"
                    ] + f"?apikey={config['schedule_api_key']}",

                    payload,

                    (
                        config[
                            "schedule_username"
                        ],

                        config[
                            "schedule_password"
                        ]
                    )
                )
            )

            a = response[
                "ResponseBody"
            ][
                "GroupWiseDataList"
            ]

            ######## **** Add log for data fetch ****

            logger.log(

                revision_id,

                "SCHEDULE",

                "WBES_FETCH",

                "SUCCESS",

                "WBES data fetched",

                {
                    "generator_count":
                        len(a)
                }
            )


            # =========================================
            # WBES CORE PROCESSING
            # =========================================

            Gen_df = pd.DataFrame()

            for entitySCHD in a:

                dc = entitySCHD[
                    'DeclarationList'
                ]

                NetScheduleAmount = (
                    entitySCHD[
                        'NetScheduleSummary'
                    ][
                        'TotalNetSchdAmount'
                    ]
                )

                Schd_tuples = [

                    (
                        entitySCHD['Acronym'],
                        'Net_Schedule'
                    )
                ]

                Schd_col_name = (
                    pd.MultiIndex
                    .from_tuples(
                        Schd_tuples
                    )
                )

                DC_tuples = [

                    (
                        entitySCHD['Acronym'],
                        'DC_Schedule'
                    )
                ]

                DC_col_name = (
                    pd.MultiIndex
                    .from_tuples(
                        DC_tuples
                    )
                )

                Schd_df = pd.DataFrame(

                    NetScheduleAmount,

                    columns=Schd_col_name
                )

                if len(dc) != 0:

                    genJsonDCName = (

                        dc[0][
                            'GeneratorTypeName'
                        ].title()

                        + 'DCJsonData'
                    )

                    if (

                        'SellerInpOnbarAmount'

                        in

                        dc[0][
                            'DeclarationData'
                        ][
                            genJsonDCName
                        ]
                    ):

                        dc_amount = (

                            dc[0][
                                'DeclarationData'
                            ][
                                genJsonDCName
                            ][
                                'SellerInpOnbarAmount'
                            ]
                        )

                    else:

                        dc_amount = (

                            dc[0][
                                'DeclarationData'
                            ][
                                genJsonDCName
                            ][
                                'SellerInpDCAmount'
                            ]
                        )

                else:

                    dc_amount = [0] * 96

                DC_df = pd.DataFrame(

                    dc_amount,

                    columns=DC_col_name
                )

                qsold = {}

                for e in entitySCHD[
                    'NetScheduleSummary'
                ][
                    'NetSchdDataList'
                ]:

                    if (

                        e[
                            'EnergyScheduleTypeName'
                        ]

                        ==

                        'OA_PX'
                    ):

                        key = (

                            e[
                                'PXTransactionTypeName'
                            ]

                            +

                            e[
                                'PXExchangeTypeName'
                            ]
                        )

                        qsold[key] = e[
                            'NetSchdAmount'
                        ]

                Qsold_tuples = [

                    (
                        entitySCHD['Acronym'],
                        'Qsold'
                    )
                ]

                Qsold_col_name = (
                    pd.MultiIndex
                    .from_tuples(
                        Qsold_tuples
                    )
                )

                Qsold_df = (
                    pd.DataFrame(qsold)
                    .sum(axis=1)
                    .to_frame()
                )

                Qsold_df.columns = (
                    Qsold_col_name
                )

                Gen_df = pd.concat(

                    [
                        Gen_df,
                        Schd_df,
                        DC_df,
                        Qsold_df
                    ],

                    axis=1
                )

            # =========================================
            # RTG FORMAT CONVERSION
            # =========================================

            Gen_df = abs(Gen_df)

            formatted_date = (
                datetime.now()
                .strftime("%Y-%m-%d")
            )

            data = []

            success_plants = []

            failed_plants = []

            success_count = 0

            failure_count = 0

            for column in Gen_df.columns.levels[0]:

                try:

                    plant_row = WBES_df[
                        WBES_df["wbes_name"] == column
                    ]

                    plant_name = ""

                    if not plant_row.empty:

                        plant_name = (
                            plant_row.iloc[0]
                            .get("plant_name", "")
                        )

                    single_data = {

                        "plant_name":
                            plant_name,

                        "plant_id":
                            wbes_dict[column],

                        "wbes_name":
                            column,

                        "dc":
                            Gen_df[column]
                            .DC_Schedule
                            .to_list(),

                        "qsold":
                            Gen_df[column]
                            .Qsold
                            .to_list(),

                        "schedule":
                            Gen_df[column]
                            .Net_Schedule
                            .to_list(),

                        "data_date":
                            formatted_date
                    }

                    data.append(single_data)

                    success_plants.append({

                        "plant_name":
                            plant_name,

                        "plant_id":
                            wbes_dict[column],

                        "wbes_name":
                            column
                    })

                except Exception as e:

                    failed_plants.append({

                        "plant_id":
                            wbes_dict.get(
                                column,
                                "UNKNOWN"
                            ),

                        "wbes_name":
                            column,

                        "error":
                            str(e)
                    })

            logger.log(

                revision_id,

                "SCHEDULE",

                "CONVERSION",

                "SUCCESS",

                "WBES conversion complete",

                {

                    "total_plants":
                        len(
                            Gen_df.columns.levels[0]
                        ),

                    "success_count":
                        len(success_plants),

                    "failed_count":
                        len(failed_plants)
                },

                response_data={

                    "success_plants":
                        success_plants,

                    "failed_plants":
                        failed_plants
                }
            )

            # =========================================
            # TOKEN
            # =========================================

            rtg_config = (
                PipelineConfigService()
                .get_config("RTG")
            )

            if not rtg_config:

                logger.log(

                    revision_id,

                    "SCHEDULE",

                    "RTG_CONFIG",

                    "FAILED",

                    "RTG config missing"
                )

                return

            token = (
                TokenService.get_token(

                    rtg_config[
                        "rtg_token_url"
                    ],

                    rtg_config[
                        "rtg_username"
                    ],

                    rtg_config[
                        "rtg_password"
                    ]
                )
            )

            logger.log(

                revision_id,

                "SCHEDULE",

                "TOKEN",

                "SUCCESS",

                "Token generated"
            )

            # =========================================
            # PUSH
            # =========================================

            push_response = (

                RTGPushService
                .push_data(

                    config[
                        "rtg_post_url"
                    ],

                    token,

                    data
                )
            )

            response_json = {}

            try:

                response_json = (
                    push_response.json()
                )

            except:

                response_json = {

                    "raw":
                        push_response.text
                }

            rtg_errors = (
                response_json.get("errors", [])
                if isinstance(response_json, dict)
                else []
            )

            rtg_results = (
                response_json.get("results", [])
                if isinstance(response_json, dict)
                else []
            )

            total_count = (
                len(rtg_results)
                + len(rtg_errors)
            )

            success_count = len(rtg_results)

            failure_count = len(rtg_errors)

            success_percent = (
                success_count * 100 / total_count
                if total_count > 0
                else 0
            )

            pipeline_status = (
                "SUCCESS"
                if success_percent >= 80
                else "FAILED"
            )

            failed_plants = [
                {
                    "plant_id": item.get("plant_id"),
                    "error": item.get("error"),
                    "details": item.get("details")
                }
                for item in rtg_errors
            ]

            logger.log(

                revision_id,

                "SCHEDULE",

                "RTG_PUSH",

                pipeline_status,

                (
                    f"{success_count} Success, "
                    f"{failure_count} Failed"
                ),

                {
                    "total_plants":
                        total_count,

                    "success_count":
                        success_count,

                    "failure_count":
                        failure_count,

                    "failed_count":
                        failure_count,

                    "success_percent":
                        round(
                            success_percent,
                            2
                        )
                },

                payload=data,

                response_data={

                    "success_plants":
                        success_plants,

                    "failed_plants":
                        failed_plants,

                    "success_count":
                        success_count,

                    "failure_count":
                        failure_count,

                    "success_percent":
                        round(
                            success_percent,
                            2
                        ),

                    "rtg_response":
                        response_json
                }
            )

        except Exception as e:

            import traceback

            logger.log(

                revision_id,

                "SCHEDULE",

                "PIPELINE",

                "FAILED",

                str(e),

                traceback_error=
                    traceback.format_exc()
            )

            raise e
        

    ########################

    @staticmethod
    def run_outage_pipeline():

        logger = PipelineLogger()

        revision_id = (
            "OUTAGE_"
            + datetime.now().strftime(
                "%Y%m%d_%H%M%S"
            )
        )

        try:

            # =========================================
            # CONFIG
            # =========================================

            config = (
                PipelineConfigService()
                .get_config(
                    "OUTAGE"
                )
            )

            if not config:

                logger.log(

                    revision_id,

                    "OUTAGE",

                    "CONFIG",

                    "FAILED",

                    "Pipeline config not found"
                )

                return

            logger.log(

                revision_id,

                "OUTAGE",

                "CONFIG",

                "SUCCESS",

                "Outage config loaded"
            )

            # =========================================
            # TOKEN
            # =========================================

            rtg_config = (
                PipelineConfigService()
                .get_config("RTG")
            )

            if not rtg_config:

                logger.log(

                    revision_id,

                    "SCHEDULE",

                    "RTG_CONFIG",

                    "FAILED",

                    "RTG config missing"
                )

                return

            token = (
                TokenService.get_token(

                    rtg_config[
                        "rtg_token_url"
                    ],

                    rtg_config[
                        "rtg_username"
                    ],

                    rtg_config[
                        "rtg_password"
                    ]
                )
            )

            logger.log(

                revision_id,

                "OUTAGE",

                "TOKEN",

                "SUCCESS",

                "Token generated"
            )

            # =========================================
            # MONGO Master Data Fetch
            # =========================================

            db = MongoService()

            unit_collection = (
                db.unit_collection
            )

            plant_collection = (
                db.map_collection
            )

            unit_data = list(
                unit_collection.find(
                    {},
                    {"_id": 0}
                )
            )

            plant_data = list(
                plant_collection.find(
                    {},
                    {"_id": 0}
                )
            )

            unit_df = pd.DataFrame(
                unit_data
            )

            plant_df = pd.DataFrame(
                plant_data
            )

            ######## **** Add log for MONGO Master Data Fetch ****

            logger.log(

                revision_id,

                "OUTAGE",

                "MASTER_FETCH",

                "SUCCESS",

                "Master data fetched",

                {
                    "unit_rows":
                        len(unit_df),

                    "plant_rows":
                        len(plant_df)
                }
            )

            # =========================================
            # Define DF
            # =========================================

            Unit_capacity_df = (
                unit_df[[
                    "plant_id",
                    "Unit_Name",
                    "Generating_Station_Name",
                    "installed_capacity"
                ]]
            )

            plant_capacity_df = (
                plant_df[[
                    "plant_id",
                    "plant_name",
                    "stage_installed_capacity"
                ]]
            )

            stationwise_remaining_capacity = {}

            for index, row in (
                plant_capacity_df.iterrows()
            ):

                gen_name = row[
                    'plant_name'
                ]

                cap = row[
                    'stage_installed_capacity'
                ]

                station = row[
                    'plant_id'
                ]

                if (
                    stationwise_remaining_capacity
                    .get(station)
                    is None
                ):

                    stationwise_remaining_capacity[
                        station
                    ] = {

                        'Installed Capacity':
                            float(cap),

                        'Remaining Capacity':
                            float(cap),

                        'Outages': {

                            'Planned Normal':
                                [],

                            'Planned RSD':
                                [],

                            'Forced Normal':
                                [],

                            'Forced Coal Shortage':
                                [],

                            'Commercial Issues':
                                [],

                            'Other Outages':
                                []
                        }
                    }

            # =========================================
            # Fetch Logbook data
            # =========================================

            outage_response = (

                ExternalFetchService
                .fetch_outage_data(

                    config[
                        "outage_fetch_url"
                    ]
                )
            )

            if not outage_response["success"]:

                logger.log(

                    revision_id,

                    "OUTAGE",

                    "OUTAGE_FETCH",

                    "FAILED",

                    outage_response["error"]
                )

                return

            genOutageDetails = (
                outage_response["data"]
            )

            GenOutage_data = [

                item

                for item in (
                    genOutageDetails[
                        'data'
                    ][
                        'currentTrElementOutages'
                    ]
                )

                if (
                    item[
                        "entityFeatureName"
                    ]
                    ==
                    "GENERATING_UNIT"
                )
            ]

            ######## **** Add log for data fetch ****

            logger.log(

                revision_id,

                "OUTAGE",

                "OUTAGE_FETCH",

                "SUCCESS",

                "Outage data fetched",

                {
                    "records":
                        len(
                            GenOutage_data
                        )
                }
            )

            # =========================================
            # PROCESSING
            # =========================================

            for out_item in (
                GenOutage_data
            ):

                unit_station = (
                    Unit_capacity_df[
                        Unit_capacity_df[
                            "Unit_Name"
                        ]
                        ==
                        out_item[
                            'elementName'
                        ]
                    ]
                )

                if (
                    unit_station.empty
                ):

                    continue

                unit_station_id = (
                    unit_station[
                        "plant_id"
                    ]
                    .values[0]
                )

                unit_capacity = (
                    unit_station[
                        "installed_capacity"
                    ]
                    .values[0]
                )

                outageInfo = {

                    'unit':
                        unit_station_id,

                    'cap':
                        unit_capacity
                }

                if (
                    out_item[
                        'outageCategory'
                    ]
                    ==
                    'Generator - Planned'
                ):

                    out_reason = (
                        out_item[
                            'reason'
                        ]
                        .lower()
                    )

                    if (

                        'reserve shut'
                        in out_reason

                        or

                        'lsd'
                        in out_reason

                        or

                        'rsd'
                        in out_reason
                    ):

                        stationwise_remaining_capacity[
                            unit_station_id
                        ][
                            'Outages'
                        ][
                            'Planned RSD'
                        ].append(
                            outageInfo
                        )

                    else:

                        stationwise_remaining_capacity[
                            unit_station_id
                        ][
                            'Outages'
                        ][
                            'Planned Normal'
                        ].append(
                            outageInfo
                        )

                elif (

                    out_item[
                        'outageCategory'
                    ]

                    ==

                    'Generator - Forced'
                ):

                    out_reason = (
                        out_item[
                            'reason'
                        ]
                        .lower()
                    )

                    if (
                        'coal'
                        in out_reason
                    ):

                        stationwise_remaining_capacity[
                            unit_station_id
                        ][
                            'Outages'
                        ][
                            'Forced Coal Shortage'
                        ].append(
                            outageInfo
                        )

                    else:

                        stationwise_remaining_capacity[
                            unit_station_id
                        ][
                            'Outages'
                        ][
                            'Forced Normal'
                        ].append(
                            outageInfo
                        )

                else:

                    continue

                stationwise_remaining_capacity[
                    unit_station_id
                ][
                    'Remaining Capacity'
                ] -= float(
                    unit_capacity
                )

            logger.log(

                revision_id,

                "OUTAGE",

                "PROCESSING",

                "SUCCESS",

                "Outage processing complete"
            )

            # =========================================
            # Convert RTG format
            # =========================================

            namingConventionMap = {

                'rsd':
                    'Planned RSD',

                'fuel_shortage':
                    'Forced Coal Shortage',

                'planned_outage':
                    'Planned Normal',

                'forced_outage':
                    'Forced Normal',

                'commercial_issues':
                    'Commercial Issues'
            }

            dataToPost = []

            for station, stationData in (
                stationwise_remaining_capacity
                .items()
            ):

                plant_row = plant_df[
                    plant_df["plant_id"]
                    ==
                    station
                ]

                plant_name = ""

                if not plant_row.empty:

                    plant_name = (
                        plant_row.iloc[0]
                        .get(
                            "plant_name",
                            ""
                        )
                    )

                singleEntry = {

                    "plant_name":
                        plant_name,

                    'rsd': 0,

                    'fuel_shortage': 0,

                    'planned_outage': 0,

                    'forced_outage': 0,

                    'plant_id': station,

                    'commercial_issues': 0
                }

                outageData = (
                    stationData[
                        'Outages'
                    ]
                )

                for outageType in (
                    namingConventionMap
                ):

                    for outage in (
                        outageData[
                            namingConventionMap[
                                outageType
                            ]
                        ]
                    ):

                        singleEntry[
                            outageType
                        ] += outage[
                            'cap'
                        ]

                if (

                    singleEntry["planned_outage"]

                    or

                    singleEntry["forced_outage"]

                    or

                    singleEntry["fuel_shortage"]

                    or

                    singleEntry["rsd"]

                ):

                    dataToPost.append(
                        singleEntry
                    )

            logger.log(

                revision_id,

                "OUTAGE",

                "CONVERSION",

                "SUCCESS",

                "RTG conversion complete",

                {
                    "records":
                        len(
                            dataToPost
                        )
                }
            )

            # =========================================
            # PUSH
            # =========================================

            headers = {

                'Content-Type':
                    'application/json',

                'Authorization':
                    f'Token {token}'
            }

            success_plants = []

            failed_plants = []

            success_count = 0

            failure_count = 0

            for d in dataToPost:

                try:

                    response2 = (
                        RTGPushService
                        .push_data(

                            config[
                                "rtg_outage_push_url"
                            ],

                            token,

                            [d]
                        )
                    )

                    response_json = {}

                    try:

                        response_json = (
                            response2.json()
                        )

                    except Exception:

                        response_json = {}

                    # =========================================
                    # SUCCESS CHECK
                    # =========================================

                    is_success = False

                    try:

                        response_json = (
                            response2.json()
                        )

                        if (

                            response2.status_code
                            in (200, 201)

                            and

                            str(
                                response_json.get(
                                    "status",
                                    ""
                                )
                            ).lower()

                            ==

                            "success"

                        ):

                            is_success = True

                    except Exception:

                        is_success = False

                    if is_success:

                        success_count += 1

                        success_plants.append({

                            "plant_name":
                                d.get(
                                    "plant_name",
                                    ""
                                ),

                            "plant_id":
                                d["plant_id"],

                            "rtg_response":
                                response_json
                        })


                    else:

                        failure_count += 1

                        failed_plants.append({

                            "plant_name":
                                d.get(
                                    "plant_name",
                                    ""
                                ),

                            "plant_id":
                                d["plant_id"],

                            "error":
                                response2.text,

                            "status_code":
                                response2.status_code,

                            "rtg_response":
                                response_json,

                            "payload":
                                d
                        })

                except Exception as e:

                    failure_count += 1

                    failed_plants.append({

                        "plant_name":
                            d.get(
                                "plant_name",
                                ""
                            ),

                        "plant_id":
                            d["plant_id"],

                        "error":
                            str(e)
                    })

            # =========================================
            # FINAL PUSH SUMMARY
            # =========================================

            total = (
                success_count
                + failure_count
            )

            success_percent = (

                success_count * 100 / total

                if total > 0

                else 0
            )

            pipeline_status = (

                "SUCCESS"

                if success_percent >= 80

                else "FAILED"
            )

            logger.log(

                revision_id,

                "OUTAGE",

                "RTG_PUSH",

                pipeline_status,

                f"{success_count} Success, {failure_count} Failed",

                {

                    "success_count":
                        success_count,

                    "failure_count":
                        failure_count,

                    "success_percent":
                        round(
                            success_percent,
                            2
                        )
                },

                payload=dataToPost,

                response_data={

                    "success_plants":
                        success_plants,

                    "failed_plants":
                        failed_plants,

                    "success_count":
                        success_count,

                    "failure_count":
                        failure_count,

                    "success_percent":
                        round(
                            success_percent,
                            2
                        )
                }
            )

        except Exception as e:

            logger.log(

                revision_id,

                "OUTAGE",

                "PIPELINE",

                "FAILED",

                str(e),

                traceback_error=
                    traceback.format_exc()
            )

            raise e
