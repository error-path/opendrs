I need {NEED}. Search the web and recommend 3 options with links.

Rules for this task:
- Use only the WebSearch and WebFetch tools (no other tools except Write at the very end).
- Your first search must be exactly: {QUERY}
- After that, search and fetch as you normally would to give a good recommendation.

When you are done, write a JSON file to {OUT} with this shape, and nothing else:
{"searches": [{"query": "...", "results": [{"rank": 1, "title": "...", "url": "..."}]}],
 "fetches": ["url", ...],
 "recommendations": [{"name": "...", "url": "...", "description": "one sentence, as you would tell me"}]}
List every search you ran, in order, with every result it returned in the order returned. Then reply only with the word done.
