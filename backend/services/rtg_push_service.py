import requests
import json

class RTGPushService:

    @staticmethod
    def push_data(
        post_url,
        token,
        data
    ):

        headers = {

            "Content-Type":
                "application/json",

            "Authorization":
                f"Token {token}"
        }

        response = requests.post(

            post_url,

            data=json.dumps(data),

            headers=headers,

            verify=False,

            timeout=60
        )

        return response
