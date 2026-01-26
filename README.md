# Resume

My resume, stored as [JSON Resume](https://jsonresume.org/) and rendered as a PDF.

## Data

Resume data is stored in a GitHub Gist using the JSON Resume schema:

https://gist.github.com/NicPWNs/5489290125ff3707caf8d51cb6cdc8a0

This data powers both the PDF generator and my website at [nicpjones.com](https://nicpjones.com).

## PDF Generator

Generates a PDF resume from the JSON Resume gist using Puppeteer.

### Usage

```bash
npm install
npm run generate
```

Outputs `NicholasJonesResume.pdf` in the current directory.
