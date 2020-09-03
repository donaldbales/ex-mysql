"use strict";
// index.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const bunyan = require("bunyan");
const fs = require("fs");
const minimist = require("minimist");
const util = require("util");
const sql = require("./sql");
const moduleName = 'index';
const database = process.env.MYSQL_DATABASE || '';
const possibleTasks = [
    'counts',
    'histograms',
    'ids',
    'search'
];
// I create this function to make it easy to develop and debug
function inspect(obj, depth = 5) {
    return util.inspect(obj, true, depth, false);
}
function argz(args = null) {
    const methodName = 'argz';
    // console.error(`${moduleName}#${methodName}: Starting...`);
    // console.error(inspect(args));
    // console.error(inspect(process.argv.slice(2)));
    const localArgs = minimist(args && args.length > 0 ? args : process.argv.slice(2), {
        alias: {
            h: 'help',
            l: 'like',
            s: 'search',
            t: 'tasks',
            v: 'version'
        },
        default: {
            t: possibleTasks.join(',')
        }
    });
    const pkg = JSON.parse(fs.readFileSync('package.json').toString());
    const name = pkg.name ? pkg.name : '';
    const version = pkg.version ? pkg.version : '';
    if (localArgs.version) {
        console.log(`${version}`);
        process.exit(0);
    }
    if (localArgs.help) {
        console.log(`Usage: node src/index [options]\n`);
        console.log(`Options:`);
        console.log(`  -h, --help     print ${name} command line options`);
        console.log(`  -t, --tasks    specify task(s) to run: ${possibleTasks.join(', ')}.`);
        console.log(`  -v, --version  print ${name} version`);
        process.exit(0);
    }
    const like = localArgs.like ? true : false;
    const search = localArgs.search;
    const result = { like, search, tasks: {} };
    const tasks = localArgs.tasks.split(',');
    console.error(tasks);
    for (const task of tasks) {
        let found = false;
        for (const possibleTask of possibleTasks) {
            if (possibleTask === task) {
                found = true;
                break;
            }
        }
        if (found) {
            result.tasks[task] = true;
        }
        else {
            console.error(`Task: ${task}, is not in the list of supported tasks: ${possibleTasks.join(', ')}.`);
            setTimeout(() => { process.exit(1); }, 10000);
        }
    }
    return result;
}
function formatTableName(catalog, schema, table) {
    return `${catalog}.${table}`;
}
function tablesAndColumns(logger, conn) {
    return __awaiter(this, void 0, void 0, function* () {
        let results = [];
        const query = `
      select TABLE_NAME,
             COLUMN_NAME
      from   INFORMATION_SCHEMA.COLUMNS
      where  TABLE_SCHEMA = '${database}'
      order by 1, 2`;
        try {
            results = yield sql.executeDML(logger, conn, query);
        }
        catch (err) {
            logger.error({ err });
            process.exit(99);
        }
        return results;
    });
}
function tablesAndIDColumns(logger, conn) {
    return __awaiter(this, void 0, void 0, function* () {
        let results = [];
        const query = `
    select TABLE_NAME,
           COLUMN_NAME
    from   INFORMATION_SCHEMA.COLUMNS
    where  TABLE_SCHEMA = '${database}'
    and   (lower(COLUMN_NAME) like '%_id'
    or     lower(COLUMN_NAME) = 'sku')
    order by 1, 2`;
        try {
            results = yield sql.executeDML(logger, conn, query);
        }
        catch (err) {
            logger.error({ err });
            process.exit(99);
        }
        return results;
    });
}
function tablesAndStringColumns(logger, conn) {
    return __awaiter(this, void 0, void 0, function* () {
        let results = [];
        const query = `
      select TABLE_NAME,
             COLUMN_NAME
      from   INFORMATION_SCHEMA.COLUMNS
      where  TABLE_SCHEMA = '${database}'
      and    DATA_TYPE in ('char', 'mediumtext', 'text', 'tinytext', 'varchar')
      order by 1, 2`;
        try {
            results = yield sql.executeDML(logger, conn, query);
        }
        catch (err) {
            logger.error({ err });
            process.exit(99);
        }
        return results;
    });
}
function counts(logger, conn, tables) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = { tables: {} };
        let i = 0;
        for (const tableName of tables.keys()) {
            let query;
            query = `select count(1) as \`count\` from ${database}.\`${tableName}\``;
            console.error(query);
            try {
                // const rows: any = await sql.executeDML(logger, conn, query);
                const rows = yield sql.executeDML(logger, conn, query);
                // console.error(rows);
                for (const row of rows) {
                    if (row.count && row.count.toString) {
                        const count = `${row.count.toString().trimRight()}`;
                        results.tables[tableName] = count;
                    }
                }
            }
            catch (err) {
                results.error = err;
                console.error(results.error);
                return results;
            }
        }
        return results;
    });
}
function histograms(logger, conn, tables) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = { tables: {} };
        for (const tableName of tables.keys()) {
            console.error(`/** ${tableName} */`);
            results.tables[tableName] = [];
            for (const columnName of tables.get(tableName)) {
                console.error(`/*** ${columnName} */`);
                if (columnName === 'next_val') {
                    continue;
                }
                else if (tableName === 'H70_AUDITTRAIL.dbo.sysdiagrams' &&
                    columnName === 'definition') {
                    continue;
                }
                let query;
                query = `
        select cast(\`${columnName}\` as char(80)) "${columnName}", 
               count(1) "count" 
        from   ${tableName} 
        group by cast(\`${columnName}\` as char(80)) 
        order by count(1) desc
        limit  100
      `;
                console.error(query);
                try {
                    const rows = yield sql.executeDML(logger, conn, query);
                    for (const row of rows) {
                        if (row.count && row.count.toString) {
                            results.tables[tableName].push(row);
                        }
                    }
                }
                catch (err) {
                    results.tables[tableName].push(err.error.message);
                }
                // break;
            }
            // break;
        }
        return results;
    });
}
function ids(logger, conn, tables) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = { ids: new Map() };
        let i = 0;
        for (const tableName of tables.keys()) {
            let query;
            for (const columnName of tables.get(tableName)) {
                query = `select distinct \`${columnName}\` as ID from ${database}.\`${tableName}\``;
                console.error(query);
                const value = `${tableName}\t${columnName}`;
                try {
                    const rows = yield sql.executeDML(logger, conn, query);
                    // console.error(rows);
                    for (const row of rows) {
                        if (row.ID && row.ID.toString) {
                            const id = `"${row.ID.toString().trimRight()}"`;
                            if (results.ids.has(id)) {
                                if (!results.ids.get(id).has(value)) {
                                    results.ids.get(id).add(value);
                                }
                            }
                            else {
                                results.ids.set(id, new Set([value]));
                            }
                            // if (++i > 5) {
                            //   break;
                            // }
                        }
                    }
                }
                catch (err) {
                    results.error = err;
                    console.error(results.error);
                    return results;
                }
            }
            // if (++i === 25) {
            //   break;
            // }
        }
        return results;
    });
}
function search(logger, conn, tables, str = '', like = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = { rows: [] };
        // let i: number = 0;
        for (const tableName of tables.keys()) {
            let query = `
      select count(1) \`${tableName}\`
      from   ${database}.\`${tableName}\`
      where  `;
            for (const columnName of tables.get(tableName)) {
                query += `lower(cast(\`${columnName}\` as char(8000))) = '${str}'\n      or     `;
                if (like) {
                    query += `lower(cast(\`${columnName}\` as char(8000))) like '${str}%'\n      or     `;
                    query += `lower(cast(\`${columnName}\` as char(8000))) like '%${str}%'\n      or     `;
                    query += `lower(cast(\`${columnName}\` as char(8000))) like '%${str}'\n      or     `;
                }
            }
            query = query.slice(0, -13);
            console.error(query);
            try {
                const result = yield sql.executeDML(logger, conn, query);
                // console.log(inspect(result));
                results.rows = results.rows.concat(result);
            }
            catch (err) {
                results.error = err;
                console.error(results.error);
                return results;
            }
        }
        return results;
    });
}
/*
function select(conn: any, query: string): Promise<any> {
  return new Promise((resolve, reject) => {
    let results: any;
    
    conn.query(query, (error: any, rows: any, fields: any) => {
      if (error) {
        results = error;
        console.error(results);
        return reject(results);
      } else {
        results = rows;
        // console.log(results);
        return resolve(results);
      }
    });
  });
}
*/
function main(...args) {
    return __awaiter(this, void 0, void 0, function* () {
        const methodName = 'main';
        const logger = bunyan.createLogger({ "name": "ex-mssql" });
        logger.level('error');
        logger.info(`${moduleName}#${methodName}: Starting...`);
        let results;
        const cla = argz(args);
        const tasks = cla.tasks;
        let conn = null;
        try {
            conn = yield sql.connect(logger);
            logger.info(`${moduleName}#${methodName}: Connected...`);
        }
        catch (err) {
            logger.error(`${moduleName}#${methodName}: ${inspect(err)}`);
        }
        if (tasks.ids) {
            results = yield tablesAndIDColumns(logger, conn);
            // console.log(results);
            let columnNames;
            columnNames = [];
            let tableName;
            tableName = results[0].TABLE_NAME;
            const tables = new Map();
            for (const result of results) {
                if (tableName !== result.TABLE_NAME) {
                    tables.set(tableName, columnNames);
                    columnNames = [];
                    tableName = result.TABLE_NAME;
                }
                columnNames.push(result.COLUMN_NAME);
            }
            tables.set(tableName, columnNames);
            // console.log(tables);
            results = yield ids(logger, conn, tables);
            const keys = Array.from(results.ids.keys());
            keys.sort();
            // console.log(results);
            for (const key of keys) {
                // console.error(`id=${id.toString()}`);
                const values = Array.from(results.ids.get(key).values());
                values.sort();
                for (const value of values) {
                    // console.error(`value=${value.toString()}`);
                    console.log(`${key}\t${value}`);
                }
            }
        }
        if (tasks.counts) {
            results = yield tablesAndColumns(logger, conn);
            // console.log(results);
            let columnNames;
            columnNames = [];
            let tableName;
            tableName = results[0].TABLE_NAME;
            const tables = new Map();
            for (const result of results) {
                if (tableName !== result.TABLE_NAME) {
                    tables.set(tableName, columnNames);
                    columnNames = [];
                    tableName = result.TABLE_NAME;
                }
                columnNames.push(result.COLUMN_NAME);
            }
            tables.set(tableName, columnNames);
            results = yield counts(logger, conn, tables);
            // console.log(results);
            for (const property in results.tables) {
                if (results.tables.hasOwnProperty(property)) {
                    console.log(`${property}\t${results.tables[property]}`);
                }
            }
        }
        if (tasks.histograms) {
            console.log(`CATALOG.TABLE\tCOLUMN\tROW\tVALUE\tCOUNT`);
            /*
            try {
              results = await databases(logger, conn);
              logger.info(`${moduleName}#${methodName}: databases ${inspect(results)}`);
            } catch (err) {
              logger.info(`${moduleName}#${methodName}: databases error=${inspect(err)}`);
              process.exit(99);
            }
            */
            const tableCatalogs = [database];
            /*
            for (const result of results) {
              tableCatalogs.push(result.name);
            }
            */
            for (const tableCatalog of tableCatalogs) {
                results = yield sql.executeDML(logger, conn, `use ${tableCatalog}`, []);
                results = yield tablesAndColumns(logger, conn);
                let columnNames = [];
                let tableName = formatTableName(tableCatalog, results[0].TABLE_SCHEMA, results[0].TABLE_NAME);
                const tables = new Map();
                for (const result of results) {
                    if (tableName !== formatTableName(tableCatalog, result.TABLE_SCHEMA, result.TABLE_NAME)) {
                        tables.set(tableName, columnNames);
                        columnNames = [];
                        tableName = formatTableName(tableCatalog, result.TABLE_SCHEMA, result.TABLE_NAME);
                    }
                    columnNames.push(result.COLUMN_NAME);
                }
                tables.set(tableName, columnNames);
                results = yield histograms(logger, conn, tables);
                // console.log(inspect(results));
                // process.exit(1);
                for (const property in results.tables) {
                    // console.log(`* ${property}`);
                    if (results.tables.hasOwnProperty(property)) {
                        const tableName = property;
                        let columnName = '';
                        let columnValue = '';
                        let count = '';
                        let rowCount = 0;
                        let lastColumnName = '';
                        for (const row of results.tables[property]) {
                            // console.log(`** ${inspect(row)}`);
                            let property2Count = 0;
                            for (const property2 in row) {
                                // console.log(`*** ${property2}, i=${i}`);
                                if (row.hasOwnProperty(property2)) {
                                    property2Count++;
                                    if (property2Count === 1) {
                                        columnName = property2;
                                        if (rowCount === 0) {
                                            lastColumnName = columnName;
                                        }
                                        columnValue = row[property2];
                                        if (lastColumnName !== columnName) {
                                            lastColumnName = columnName;
                                            rowCount = 0;
                                        }
                                        rowCount++;
                                    }
                                    else if (property2Count === 2) {
                                        count = row[property2];
                                    }
                                }
                            }
                            console.log(`${tableName}\t${columnName}\t${rowCount}\t${columnValue}\t${count}`);
                        }
                    }
                }
            }
        }
        if (tasks.search) {
            // results = await tablesAndStringColumns(logger, conn);
            results = yield tablesAndColumns(logger, conn);
            // console.log(results);
            let columnNames;
            columnNames = [];
            let tableName;
            tableName = results[0].TABLE_NAME;
            const tables = new Map();
            for (const result of results) {
                if (tableName !== result.TABLE_NAME) {
                    tables.set(tableName, columnNames);
                    columnNames = [];
                    tableName = result.TABLE_NAME;
                }
                columnNames.push(result.COLUMN_NAME);
            }
            tables.set(tableName, columnNames);
            // console.log(tables);
            console.error(cla);
            const localSearch = cla.search && cla.search.toLowerCase ? cla.search.toLowerCase() : '';
            results = yield search(logger, conn, tables, localSearch, cla.like);
            // console.log(results);
            for (const row of results.rows) {
                let str = ``;
                for (const col in row) {
                    str += `${col}\t${row[col]}\t`;
                }
                console.log(str);
            }
        }
        conn.end();
    });
}
exports.default = main;
// Start the program
if (require.main === module) {
    main();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsV0FBVzs7Ozs7Ozs7OztBQUVYLGlDQUFpQztBQUVqQyx5QkFBeUI7QUFDekIscUNBQXFDO0FBQ3JDLDZCQUE2QjtBQUU3Qiw2QkFBNkI7QUFHN0IsTUFBTSxVQUFVLEdBQVcsT0FBTyxDQUFDO0FBRW5DLE1BQU0sUUFBUSxHQUFZLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBeUIsSUFBSSxFQUFFLENBQUM7QUFFdEUsTUFBTSxhQUFhLEdBQVU7SUFDM0IsUUFBUTtJQUNSLFlBQVk7SUFDWixLQUFLO0lBQ0wsUUFBUTtDQUNULENBQUM7QUFFRiw4REFBOEQ7QUFDOUQsaUJBQWlCLEdBQVEsRUFBRSxRQUFnQixDQUFDO0lBQzFDLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztBQUMvQyxDQUFDO0FBRUQsY0FBYyxPQUFZLElBQUk7SUFDNUIsTUFBTSxVQUFVLEdBQVcsTUFBTSxDQUFDO0lBRWxDLDZEQUE2RDtJQUU3RCxnQ0FBZ0M7SUFDaEMsaURBQWlEO0lBRWpELE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDakYsS0FBSyxFQUFFO1lBQ0wsQ0FBQyxFQUFFLE1BQU07WUFDVCxDQUFDLEVBQUUsTUFBTTtZQUNULENBQUMsRUFBRSxRQUFRO1lBQ1gsQ0FBQyxFQUFFLE9BQU87WUFDVixDQUFDLEVBQUUsU0FBUztTQUNiO1FBQ0QsT0FBTyxFQUFFO1lBQ1AsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1NBQzNCO0tB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