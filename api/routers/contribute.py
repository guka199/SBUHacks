"""Records a data contribution. The web app's /api/reward route then sends the Solana tokens."""

import os
import uuid

from fastapi import APIRouter

from api.schemas import ContributeRequest, ContributeResponse
from api.services import snowflake

router = APIRouter(tags=["rewards"])


@router.post("/contribute", response_model=ContributeResponse)
def contribute(req: ContributeRequest) -> ContributeResponse:
    contribution_id = uuid.uuid4().hex
    tokens = int(os.getenv("REWARD_TOKENS_PER_CONTRIBUTION", "10"))
    snowflake.execute(
        """
        INSERT INTO CONTRIBUTIONS (id, user_id, wallet_address, posts_shared, tokens_owed)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (contribution_id, req.user_id, req.wallet_address, req.posts_shared, tokens),
    )
    return ContributeResponse(contribution_id=contribution_id, tokens_owed=tokens)
