node:fs:440
    return binding.readFileUtf8(path, stringToFlags(options.flag));
                   ^

Error: ENOENT: no such file or directory, open 'src/routes/contra-prova..tsx'
    at Object.readFileSync (node:fs:440:20)
    at [eval]:1:48
    at runScriptInThisContext (node:internal/vm:219:10)
    at node:internal/process/execution:451:12
    at [eval]-wrapper:6:24
    at runScriptInContext (node:internal/process/execution:449:60)
    at evalFunction (node:internal/process/execution:283:30)
    at evalTypeScript (node:internal/process/execution:295:3)
    at node:internal/main/eval_string:71:3 {
  errno: -2,
  code: 'ENOENT',
  syscall: 'open',
  path: 'src/routes/contra-prova..tsx'
}

Node.js v24.14.0
