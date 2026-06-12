import requests

class TokenService:

    TOKEN_KEYS = (
        "token",
        "access",
        "access_token",
        "auth_token",
        "key"
    )

    @staticmethod
    def _safe_response_text(response):

        text = response.text or ""

        if len(text) > 500:

            return text[:500] + "..."

        return text

    @staticmethod
    def get_token(
        token_url,
        username,
        password
    ):

        response = None
        last_error = None

        for attempt in range(1, 3):

            try:

                response = requests.post(

                    token_url,

                    data={

                        "username":
                            username,

                        "password":
                            password
                    },

                    verify=False,

                    timeout=30
                )

                break

            except requests.exceptions.RequestException as exc:

                last_error = exc

                if attempt == 2:

                    raise Exception(
                        "Token generation failed: "
                        f"{exc.__class__.__name__}: {exc}"
                    ) from exc

        if response is None and last_error is not None:

            raise Exception(
                "Token generation failed: "
                f"{last_error.__class__.__name__}: {last_error}"
            )

        if not response.ok:

            raise Exception(
                "Token generation failed "
                f"({response.status_code}): "
                f"{TokenService._safe_response_text(response)}"
            )

        try:

            payload = response.json()

        except ValueError as exc:

            raise Exception(
                "Token generation failed: "
                "auth response was not valid JSON"
            ) from exc

        token = next(
            (
                payload.get(key)
                for key in TokenService.TOKEN_KEYS
                if payload.get(key)
            ),
            None
        )

        if not token:

            raise Exception(
                "Token generation failed: "
                "auth response did not contain a token"
            )

        return token
