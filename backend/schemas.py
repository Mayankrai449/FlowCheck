from pydantic import BaseModel, ConfigDict, Field


class NodeDataPayload(BaseModel):
    method: str = "GET"
    url: str
    headers: dict[str, str] = Field(default_factory=dict)
    body: str | None = None


class FlowNodeIn(BaseModel):
    id: str
    data: NodeDataPayload


class FlowEdgeIn(BaseModel):
    source: str
    target: str


class ExecuteFlowRequest(BaseModel):
    nodes: list[FlowNodeIn]
    edges: list[FlowEdgeIn]


class ExecuteNodeResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    node_id: str = Field(serialization_alias="nodeId")
    status_code: int | None = Field(serialization_alias="statusCode")
    duration_ms: float = Field(serialization_alias="durationMs")
    response_preview: str | None = Field(
        default=None,
        serialization_alias="responsePreview",
    )
    error: str | None = None


class ExecuteFlowResponse(BaseModel):
    results: list[ExecuteNodeResult]
