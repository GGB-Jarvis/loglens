.PHONY: install sample test lint analyze serve web web-build clean

install:
	python3 -m venv .venv
	.venv/bin/pip install -e ".[dev]"

sample:
	.venv/bin/python examples/make_sample.py

test:
	.venv/bin/pytest

lint:
	.venv/bin/ruff check backend/loglens backend/tests

analyze: sample
	.venv/bin/loglens analyze examples/demo --pack generic --name demo --no-llm

serve:
	.venv/bin/loglens serve --host 127.0.0.1 --port 8000

web:
	npm run dev

web-build:
	npm run build

clean:
	rm -rf data .pytest_cache .ruff_cache
