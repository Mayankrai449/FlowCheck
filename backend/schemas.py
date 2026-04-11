from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class RetryConfigData(BaseModel):
    """Accepted for API parity; execution retries are handled on the client."""

    model_config = ConfigDict(extra="ignore")

    max_retries: int = Field(default=0, ge=0, le=50)
    delay_ms: int = Field(default=1000, ge=0, le=600_000)
    use_exponential_backoff: bool = False


class HttpNodeData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    method: str = "GET"
    url: str = ""
    headers: dict[str, str] = Field(default_factory=dict)
    body: str | None = None
    retry_config: RetryConfigData | None = None
    continue_on_fail: bool = False


class ConditionNodeData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    expression: str = "true"
    eval_mode: Literal["safe_expr", "python_sandbox"] = "safe_expr"
    retry_config: RetryConfigData | None = None
    continue_on_fail: bool = False


class CodeNodeData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: str = ""
    timeout_s: float = Field(default=5.0, ge=0.5, le=30.0)
    code_language: Literal["python", "javascript"] = Field(
        default="python",
        validation_alias=AliasChoices("code_language", "codeLanguage"),
    )
    retry_config: RetryConfigData | None = None
    continue_on_fail: bool = False


class TriggerNodeData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    label: str = "Trigger"
    note: str | None = None
    retry_config: RetryConfigData | None = None
    continue_on_fail: bool = False


class HttpFlowNode(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    type: Literal["http"] = "http"
    data: HttpNodeData


class ConditionFlowNode(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    type: Literal["condition"] = "condition"
    data: ConditionNodeData


class CodeFlowNode(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    type: Literal["code"] = "code"
    data: CodeNodeData


class TriggerFlowNode(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    type: Literal["trigger"] = "trigger"
    data: TriggerNodeData


FlowNodeIn = Annotated[
    Union[HttpFlowNode, ConditionFlowNode, CodeFlowNode, TriggerFlowNode],
    Field(discriminator="type"),
]


class FlowEdgeIn(BaseModel):
    source: str
    target: str


class ExecuteFlowRequest(BaseModel):
    nodes: list[FlowNodeIn]
    edges: list[FlowEdgeIn]


class ExecuteWaveRequest(BaseModel):
    """One parallel wave with upstream outputs supplied by the client (resolved templates)."""

    nodes: list[FlowNodeIn]
    context: dict[str, Any] = Field(default_factory=dict)


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
    error_detail: str | None = Field(
        default=None,
        serialization_alias="errorDetail",
    )


class ExecuteFlowResponse(BaseModel):
    results: list[ExecuteNodeResult]
