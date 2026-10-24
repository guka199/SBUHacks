"""Errors safe to show in API responses (never include provider URLs or secrets)."""


class ServiceError(Exception):
    def __init__(self, message: str, status_code: int = 503):
        self.status_code = status_code
        super().__init__(message)


class ConfigurationError(ServiceError):
    pass


class StorageError(ServiceError):
    pass


class InvalidImport(ServiceError):
    def __init__(self, message: str):
        super().__init__(message, 422)
