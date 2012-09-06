views-benchmarks
================

Benchmarks cache vs. no-cache

Usage
-----

In the views root, run:

```bash
$ make bench
```

My results
----------

For handlebars, no improvement ... warrants research. Perhaps handlebars already
caches?

```
SUMMARY
-------

****************  with-cache (545.49 rps)
****************  no-cache (542.53 rps)
```
