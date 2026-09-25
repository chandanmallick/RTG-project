"""Validate database destinations locally, before creating any network client."""

from ipaddress import ip_address

from pymongo.uri_parser import parse_uri


def internal_database_uri(uri: str) -> str:
    # Reject discovery URIs before the parser can perform DNS queries.
    error = "Database connections require a standard URI with an internal host."
    if not uri.startswith("mongodb://"):
        raise ValueError(error)
    try:
        parsed = parse_uri(uri)
        nodes = parsed["nodelist"]
        # A single LAN endpoint only; no proxy or replica discovery destinations.
        if len(nodes) != 1 or any(str(key).lower().startswith("proxy") for key in parsed["options"]):
            raise ValueError(error)
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
