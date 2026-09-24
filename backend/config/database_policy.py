"""Validate database destinations locally, before creating any network client."""

from ipaddress import ip_address

from pymongo.uri_parser import parse_uri


def internal_database_uri(uri: str) -> str:
    # Reject discovery URIs before the parser can perform DNS queries.
    error = "Database connections require a standard URI with an internal host."
    if not uri.startswith("mongodb://"):
        raise ValueError(error)
    try:
        nodes = parse_uri(uri)["nodelist"]
        for host, _port in nodes:
            hostname = host.lower().rstrip(".")
            if hostname == "localhost" or hostname.endswith(".internal.erldc.in"):
                continue
            address = ip_address(hostname)
            if not (address.is_private or address.is_loopback) or address.is_unspecified or address.is_multicast:
                raise ValueError(error)
    except Exception:
        # Never include a URI or credentials in validation errors.
        raise ValueError(error) from None
    return uri
