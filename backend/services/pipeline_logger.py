from datetime import datetime

import traceback

from services.db_handler import (
    MongoService
)

class PipelineLogger:

    def __init__(self):

        self.collection = None

        try:
            self.db = MongoService().db
            self.collection = (
                self.db["pipeline_logs"]
            )
        except Exception as e:
            print(f"Pipeline logging disabled: {e}")

    def log(

        self,

        revision_id,

        pipeline_type,

        process_name,

        status,

        message,

        extra_data=None,

        payload=None,

        response_data=None,

        traceback_error=None
    ):

        if self.collection is None:
            print(
                f"Pipeline log skipped [{status}] "
                f"{pipeline_type}/{process_name}: {message}"
            )
            return

        self.collection.insert_one({

            "revision_id":
                revision_id,

            "pipeline_type":
                pipeline_type,

            "process_name":
                process_name,

            "status":
                status,

            "message":
                message,

            "extra_data":
                extra_data or {},

            "payload":
                payload,

            "response_data":
                response_data,

            "traceback":
                traceback_error,

            "timestamp":
                datetime.now()
        })
