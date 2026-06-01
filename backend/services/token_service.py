import requests

class TokenService:

    @staticmethod
    def get_token(
        token_url,
        username,
        password
    ):

        response = requests.post(

            token_url,

            data={

                "username":
                    username,

                "password":
                    password
            },

            verify=False
        )

        if response.status_code != 200:

            raise Exception(
                "Token generation failed"
            )

        return response.json().get(
            "token"
        )