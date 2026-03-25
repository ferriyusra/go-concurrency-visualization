# Vulnerabilities Check - Find existing vulnerabilities 
Find existing vulnerabilities by osv-scanner (if supported)

## OSV-Scanner
Do steps osv-scanner check if project language supported (C/C++, Dart, Elixir, Go, Java, Javascript, PHP, Python, R, Ruby, Rust), if not then skip 

### Step 1: install OSV-Scanner
check if user have `osv-scanner` in their local machine or not then help them do installation, based on their local machine,
use refference from https://google.github.io/osv-scanner/installation

### Step 2: Run OSV-Scanner
1.  Run `osv-scanner -r . --format json`
2. Parse and summarize output:
   - Number of vulnerabilities
   - Severity breakdown
   - Affected packages and CVEs
3. If any `CRITICAL` or `HIGH` vulnerabilities found, return warning and ask user what next to do, if their need your help to fix it or not