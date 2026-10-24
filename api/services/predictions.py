"""Persist completed scores when a user ID is provided; scoring remains usable offline."""

from api.services import snowflake
from api.services.errors import ServiceError


def persist(user_id: str | None, caption: str, result, context: dict):
    if user_id:
        try:
            result.prediction_id = snowflake.save_prediction(user_id, caption, result, context)
        except ServiceError:
            result.storage_warning = "Your score is ready, but it was not saved to history. Please try again later."
    return result
