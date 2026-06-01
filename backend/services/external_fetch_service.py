import requests

# This keeps your SAME WBES fetch logic.

# Future:

# outage
# scada
# forecast

# will come here.

class ExternalFetchService:

    @staticmethod
    def fetch_wbes_data(
        url,
        payload,
        auth
    ):

        response = requests.post(

            url,

            json=payload,

            auth=auth
        )

        return response.json()
    
    @staticmethod
    def fetch_outage_data(url):

        try:

            response = requests.get(

                url,

                timeout=30
            )

            response.raise_for_status()

            return {

                "success": True,

                "data":
                    response.json()
            }

        except Exception as e:

            return {

                "success": False,

                "error":
                    str(e)
            }