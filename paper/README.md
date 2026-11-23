# Paper drafts

`tool-report.md` is the arXiv cs.SE tool report on opendrs's Diff Risk Score reproduction, to be
reused for the FSE 2027 tool-demo track (due 26 Jan 2027). Every number in it carries a source
path in an HTML comment; keep that true when editing.

## FSE 2027 tool-demo requirements to check

- TODO-verify: page limit (and whether references count)
- TODO-verify: demo video required, maximum length, hosting
- TODO-verify: template (ACM `acmart` sigconf?) and double-blind or not
- TODO-verify: artifact availability or DOI requirement, and the 26 Jan 2027 deadline
- TODO-verify: whether an arXiv preprint before submission is allowed

## Convert to LaTeX and arXiv

1. `pandoc paper/tool-report.md -o paper/tool-report.tex --standalone` (or paste into the `acmart`
   template); put references in a `.bib` file and replace the prose citations in Section 5 with `\cite{}`.
2. Convert the tables to `booktabs`; drop the HTML source comments or turn them into footnotes.
3. Compile locally; arXiv needs the `.tex`, the `.bib` or compiled `.bbl`, and figures in one archive.
4. Choose category cs.SE (cross-list cs.LG if wanted), upload, and check the PDF arXiv builds.
5. Archive a release on Zenodo first and cite the DOI in the Availability section.
