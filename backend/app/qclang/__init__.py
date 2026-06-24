"""
QCLang — Quantum Chip Language compiler pipeline.

Two parsers exist (DEPRECATION IN PROGRESS):
  qclang/{lexer,parser,validator,compiler}.py — simple V1 parser (LEGACY)
  qclang/full/                                — full V2 parser (CANONICAL)

routers/qclang.py loads the full/ parser preferentially and falls back to the
simple parser when qclang/full is unavailable.  Once the full parser is
confirmed stable, the simple parser will be deleted.

New code must import from app.qclang.full only.
"""
