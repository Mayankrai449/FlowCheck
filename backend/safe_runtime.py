"""
Restricted evaluation for condition expressions and user code nodes.
Not a full sandbox; paired with locked-down __builtins__ for exec().
"""

from __future__ import annotations

import ast
import operator as op
from typing import Any


class UnsafeExpressionError(ValueError):
    pass


_ALLOWED_EXPR_NODES: tuple[type[ast.AST], ...] = (
    ast.Expression,
    ast.BoolOp,
    ast.And,
    ast.Or,
    ast.BinOp,
    ast.UnaryOp,
    ast.Not,
    ast.USub,
    ast.UAdd,
    ast.Invert,
    ast.Compare,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
    ast.Is,
    ast.IsNot,
    ast.In,
    ast.NotIn,
    ast.IfExp,
    ast.Subscript,
    ast.Slice,
    ast.Tuple,
    ast.List,
    ast.Dict,
    ast.Set,
    ast.Constant,
    ast.Name,
    ast.Load,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.FloorDiv,
    ast.Mod,
    ast.Pow,
    ast.BitOr,
    ast.BitAnd,
    ast.BitXor,
    ast.LShift,
    ast.RShift,
)

_BINOPS: dict[type[ast.operator], Any] = {
    ast.Add: op.add,
    ast.Sub: op.sub,
    ast.Mult: op.mul,
    ast.Div: op.truediv,
    ast.FloorDiv: op.floordiv,
    ast.Mod: op.mod,
    ast.Pow: op.pow,
    ast.BitOr: op.or_,
    ast.BitAnd: op.and_,
    ast.BitXor: op.xor,
    ast.LShift: op.lshift,
    ast.RShift: op.rshift,
}

_CMPOPS: dict[type[ast.cmpop], Any] = {
    ast.Eq: op.eq,
    ast.NotEq: op.ne,
    ast.Lt: op.lt,
    ast.LtE: op.le,
    ast.Gt: op.gt,
    ast.GtE: op.ge,
    ast.Is: op.is_,
    ast.IsNot: op.is_not,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}


def _validate_expr_tree(tree: ast.AST) -> None:
    for n in ast.walk(tree):
        if not isinstance(n, _ALLOWED_EXPR_NODES):
            raise UnsafeExpressionError(f"Disallowed syntax: {type(n).__name__}")
        if isinstance(n, ast.Name) and n.id not in ("ctx", "True", "False", "None"):
            raise UnsafeExpressionError(f"Unknown name {n.id!r}; only ctx is allowed")


def eval_condition_expression(expression: str, ctx: dict[str, Any]) -> bool:
    expr = (expression or "").strip()
    if not expr:
        raise UnsafeExpressionError("Empty expression")
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as e:
        raise UnsafeExpressionError(str(e)) from e
    _validate_expr_tree(tree)
    out = _eval_ast(tree, ctx)
    return bool(out)


def _eval_ast(node: ast.AST, ctx: dict[str, Any]) -> Any:
    if isinstance(node, ast.Expression):
        return _eval_ast(node.body, ctx)
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        if node.id == "ctx":
            return ctx
        if node.id == "True":
            return True
        if node.id == "False":
            return False
        if node.id == "None":
            return None
        raise UnsafeExpressionError(f"Unknown name {node.id!r}")
    if isinstance(node, ast.UnaryOp):
        v = _eval_ast(node.operand, ctx)
        if isinstance(node.op, ast.Not):
            return not v
        if isinstance(node.op, ast.USub):
            return -v
        if isinstance(node.op, ast.UAdd):
            return +v
        if isinstance(node.op, ast.Invert):
            return ~v
        raise UnsafeExpressionError("Unsupported unary op")
    if isinstance(node, ast.BoolOp):
        vals = [_eval_ast(v, ctx) for v in node.values]
        if isinstance(node.op, ast.And):
            out = True
            for v in vals:
                out = out and bool(v)
            return out
        if isinstance(node.op, ast.Or):
            out = False
            for v in vals:
                out = out or bool(v)
            return out
        raise UnsafeExpressionError("Unsupported bool op")
    if isinstance(node, ast.BinOp):
        fn = _BINOPS.get(type(node.op))
        if fn is None:
            raise UnsafeExpressionError("Unsupported binary op")
        return fn(_eval_ast(node.left, ctx), _eval_ast(node.right, ctx))
    if isinstance(node, ast.Compare):
        left = _eval_ast(node.left, ctx)
        cur = left
        for op_, comp in zip(node.ops, node.comparators, strict=True):
            fn = _CMPOPS.get(type(op_))
            if fn is None:
                raise UnsafeExpressionError("Unsupported comparison")
            right = _eval_ast(comp, ctx)
            if not fn(cur, right):
                return False
            cur = right
        return True
    if isinstance(node, ast.IfExp):
        return (
            _eval_ast(node.body, ctx)
            if _eval_ast(node.test, ctx)
            else _eval_ast(node.orelse, ctx)
        )
    if isinstance(node, ast.Subscript):
        value = _eval_ast(node.value, ctx)
        if isinstance(node.slice, ast.Slice):
            sl = slice(
                _eval_ast(node.slice.lower, ctx) if node.slice.lower else None,
                _eval_ast(node.slice.upper, ctx) if node.slice.upper else None,
                _eval_ast(node.slice.step, ctx) if node.slice.step else None,
            )
            return value[sl]
        key = _eval_ast(node.slice, ctx)
        return value[key]
    if isinstance(node, ast.Tuple):
        return tuple(_eval_ast(e, ctx) for e in node.elts)
    if isinstance(node, ast.List):
        return [_eval_ast(e, ctx) for e in node.elts]
    if isinstance(node, ast.Set):
        return {_eval_ast(e, ctx) for e in node.elts}
    if isinstance(node, ast.Dict):
        return {
            _eval_ast(k, ctx): _eval_ast(v, ctx)
            for k, v in zip(node.keys, node.values, strict=True)
        }
    if isinstance(node, ast.Starred):
        raise UnsafeExpressionError("Starred expressions are not allowed")
    raise UnsafeExpressionError(f"Unsupported node {type(node).__name__}")


_FORBIDDEN_CODE_NAMES = frozenset(
    {
        "__import__",
        "eval",
        "exec",
        "compile",
        "open",
        "globals",
        "locals",
        "vars",
        "getattr",
        "setattr",
        "delattr",
        "input",
        "breakpoint",
        "memoryview",
        "help",
    }
)


class _CodeAstValidator(ast.NodeVisitor):
    def visit_Import(self, node: ast.Import) -> None:
        raise UnsafeExpressionError("import is not allowed")

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        raise UnsafeExpressionError("import is not allowed")

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if node.attr.startswith("_"):
            raise UnsafeExpressionError("Private attribute access is not allowed")
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if node.id in _FORBIDDEN_CODE_NAMES:
            raise UnsafeExpressionError(f"Name {node.id!r} is not allowed")

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        raise UnsafeExpressionError("async def is not allowed")

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        raise UnsafeExpressionError("class is not allowed")


def validate_user_code(source: str) -> ast.Module:
    try:
        mod = ast.parse(source or "", mode="exec")
    except SyntaxError as e:
        raise UnsafeExpressionError(str(e)) from e
    _CodeAstValidator().visit(mod)
    return mod


_MAX_JS_LEN = 200_000


def run_user_javascript(source: str, ctx: dict[str, Any]) -> Any:
    """
    Run user JS in an embedded V8 (PyMiniRacer). User code shares `ctx` and
    assigns to `result`. Output is JSON-serialized in JS then parsed in Python
    so objects become native dict/list types.
    """
    if len(source or "") > _MAX_JS_LEN:
        raise UnsafeExpressionError("Code is too long")
    try:
        from py_mini_racer import MiniRacer
    except ImportError as e:
        raise UnsafeExpressionError(
            "JavaScript requires py-mini-racer. Install: pip install py-mini-racer",
        ) from e

    import json

    ctx_json = json.dumps(ctx, default=str)
    mr = MiniRacer()
    mr.eval(f"var __fcCtx = {ctx_json};")
    wrapped = (
        "(function(){ var ctx = __fcCtx; var result = undefined;\n"
        + (source or "")
        + "\ntry { return JSON.stringify(result === undefined ? null : result); }"
        + "\ncatch (e) { throw e; } })()"
    )
    raw = mr.eval(wrapped)
    if raw is None:
        return None
    if not isinstance(raw, str):
        raw = str(raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def run_user_code(source: str, ctx: dict[str, Any]) -> Any:
    validate_user_code(source)
    safe_builtins: dict[str, Any] = {
        "len": len,
        "str": str,
        "int": int,
        "float": float,
        "bool": bool,
        "min": min,
        "max": max,
        "sum": sum,
        "abs": abs,
        "round": round,
        "sorted": sorted,
        "repr": repr,
        "enumerate": enumerate,
        "zip": zip,
        "range": range,
        "isinstance": isinstance,
        "list": list,
        "dict": dict,
        "tuple": tuple,
        "set": set,
        "frozenset": frozenset,
        "any": any,
        "all": all,
        "print": lambda *a, **k: None,
        "True": True,
        "False": False,
        "None": None,
    }
    g: dict[str, Any] = {"__builtins__": safe_builtins}
    loc: dict[str, Any] = {"ctx": ctx, "result": None}
    exec(compile(source or "", "<code_node>", "exec"), g, loc)
    return loc.get("result")
