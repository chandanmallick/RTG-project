"""Database destination and Crew routing regressions; no live connections."""
import importlib
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config.database_policy import internal_database_uri


class DatabasePolicyTests(unittest.TestCase):
    def test_internal_destinations(self):
        for host in ("10.3.230.60", "127.0.0.1", "localhost", "mongo.internal.erldc.in", "[::1]"):
            uri = f"mongodb://{host}:27017/"
            with self.subTest(host=host):
                self.assertEqual(internal_database_uri(uri), uri)

    def test_reject_external_and_discovery_before_dns(self):
        with patch("socket.getaddrinfo", side_effect=AssertionError("DNS attempted")) as dns:
            for uri in ("https://cloud.example/", "mongodb://cloud.example/",
                        "mongodb://8.8.8.8/", "mongodb://10.3.230.60,10.3.230.61/",
                        "mongodb://10.3.230.60/?proxyHost=8.8.8.8", "mongodb://10.3.230.60,cloud.example/",
                        "mongodb://user:secret@cloud.example/", "mongodb://0.0.0.0/"):
                with self.subTest(uri=uri), self.assertRaises(ValueError) as caught:
                    internal_database_uri(uri)
                self.assertNotIn("secret", str(caught.exception))
            dns.assert_not_called()

    def test_main_database_client_disables_discovery(self):
        # Execute just the service constructor with a mock client and settings.
        import ast
        source = Path(__file__).resolve().parents[1] / "services/db_handler.py"
        tree = ast.parse(source.read_text())
        cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "MongoService")
        init = next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == "__init__")
        tree = ast.Module(body=[init], type_ignores=[])
        context = {name.id: "test" for name in ast.walk(init) if isinstance(name, ast.Name)}
        client = MagicMock()
        context.update(MongoClient=client, MONGO_URI="mongodb://10.3.230.60:27017/", MONGO_SERVER_SELECTION_TIMEOUT_MS=5000)
        exec(compile(tree, str(source), "exec"), context)
        context["__init__"](MagicMock())
        self.assertTrue(client.call_args.kwargs["directConnection"])

    def test_crew_uses_one_internal_client_for_all_collections(self):
        name = "crew_legacy.database.database_mongo"
        previous = sys.modules.pop(name, None)
        try:
            with patch.dict(os.environ, {
                "CREW_LOCAL_MONGO_URI": "mongodb://10.3.230.60:27017/",
                "CREW_LOCAL_MONGO_DB_NAME": "crew_test",
            }), patch("pymongo.MongoClient", MagicMock()) as client, patch("gridfs.GridFS"):
                module = importlib.import_module(name)
                client.assert_called_once_with("mongodb://10.3.230.60:27017/", serverSelectionTimeoutMS=5000, directConnection=True)
                self.assertIs(module.db, module.local_db)
                self.assertIs(module.client, module.local_client)
                self.assertIs(module.roster_collection, module.local_db["roster_collection"])
        finally:
            sys.modules.pop(name, None)
            if previous is not None:
                sys.modules[name] = previous


if __name__ == "__main__":
    unittest.main()
