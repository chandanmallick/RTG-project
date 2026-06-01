# services/api_client.py
import requests
import ssl
import urllib3

class APIClient:
    def __init__(self):
        self.session = self._get_legacy_session()

    def _get_legacy_session(self):
        ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
        ctx.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
        
        class CustomHttpAdapter(requests.adapters.HTTPAdapter):
            def init_poolmanager(self, connections, maxsize, block=False):
                self.poolmanager = urllib3.poolmanager.PoolManager(
                    num_pools=connections, maxsize=maxsize,
                    block=block, ssl_context=ctx)

        session = requests.session()
        session.mount('https://', CustomHttpAdapter())
        return session

    def fetch(self, url):
        return self.session.get(url).json()