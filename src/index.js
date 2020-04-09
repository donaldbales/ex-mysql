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
const fs = require("fs");
const minimist = require("minimist");
const mysql = require("mysql");
const util = require("util");
const database = process.env.MYSQL_DATABASE || 'akeneo_pim';
// const database: string = (process.env.MYSQL_DATABASE as string) || 'staplescom26_pdb';
const moduleName = 'index';
const possibleTasks = [
    'counts',
    'ids',
    'search'
];
// I create this function to make it easy to develop and debug
function inspect(obj, depth = 5) {
    return util.inspect(obj, true, depth, false);
}
function argz(args = null) {
    const methodName = 'argz';
    console.error(`${moduleName}#${methodName}: Starting...`);
    console.error(inspect(args));
    console.error(inspect(process.argv.slice(2)));
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
function tablesAndColumns(conn) {
    return new Promise((resolve, reject) => {
        const result = {};
        conn.query(`
      select TABLE_NAME,
             COLUMN_NAME
      from   INFORMATION_SCHEMA.COLUMNS
      where  TABLE_SCHEMA = '${database}'
      order by 1, 2
    `, (error, results, fields) => {
            if (error) {
                result.error = error;
                console.error(result.error);
                return reject(result);
            }
            else {
                result.results = results;
                result.fields = fields;
                return resolve(result);
            }
        });
    });
}
function tablesAndIDColumns(conn) {
    return new Promise((resolve, reject) => {
        const result = {};
        conn.query(`
      select TABLE_NAME,
             COLUMN_NAME
      from   INFORMATION_SCHEMA.COLUMNS
      where  TABLE_SCHEMA = '${database}'
      and   (lower(COLUMN_NAME) like '%_id'
      or     lower(COLUMN_NAME) = 'sku')
      order by 1, 2
    `, (error, results, fields) => {
            if (error) {
                result.error = error;
                console.error(result.error);
                return reject(result);
            }
            else {
                result.results = results;
                result.fields = fields;
                return resolve(result);
            }
        });
    });
}
function tablesAndStringColumns(conn) {
    return new Promise((resolve, reject) => {
        const result = {};
        conn.query(`
      select TABLE_NAME,
             COLUMN_NAME
      from   INFORMATION_SCHEMA.COLUMNS
      where  TABLE_SCHEMA = '${database}'
      and    DATA_TYPE in ('char', 'mediumtext', 'text', 'tinytext', 'varchar')
      order by 1, 2
    `, (error, results, fields) => {
            if (error) {
                result.error = error;
                console.error(result.error);
                return reject(result);
            }
            else {
                result.results = results;
                result.fields = fields;
                return resolve(result);
            }
        });
    });
}
function counts(conn, tables) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = { tables: {} };
        let i = 0;
        for (const tableName of tables.keys()) {
            let sql;
            sql = `select count(1) as \`count\` from ${database}.\`${tableName}\``;
            console.error(sql);
            try {
                const rows = yield select(conn, sql);
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
function ids(conn, tables) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = { ids: new Map() };
        let i = 0;
        for (const tableName of tables.keys()) {
            let sql;
            for (const columnName of tables.get(tableName)) {
                sql = `select distinct \`${columnName}\` as ID from ${database}.\`${tableName}\``;
                console.error(sql);
                const value = `${tableName}\t${columnName}`;
                try {
                    const rows = yield select(conn, sql);
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
function search(conn, tables, str = '', like = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const results = { rows: [] };
        // let i: number = 0;
        for (const tableName of tables.keys()) {
            let sql = `
      select count(1) \`${tableName}\`
      from   ${database}.\`${tableName}\`
      where  `;
            for (const columnName of tables.get(tableName)) {
                sql += `lower(\`${columnName}\`) = '${str}'\n      or     `;
                if (like) {
                    sql += `lower(\`${columnName}\`) like '${str} %'\n      or     `;
                    sql += `lower(\`${columnName}\`) like '% ${str} %'\n      or     `;
                    sql += `lower(\`${columnName}\`) like '% ${str}'\n      or     `;
                }
            }
            sql = sql.slice(0, -13);
            console.error(sql);
            try {
                const result = yield select(conn, sql);
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
function select(conn, sql) {
    return new Promise((resolve, reject) => {
        let results;
        conn.query(sql, (error, rows, fields) => {
            if (error) {
                results = error;
                console.error(results);
                return reject(results);
            }
            else {
                results = rows;
                // console.log(results);
                return resolve(results);
            }
        });
    });
}
function main(...args) {
    return __awaiter(this, void 0, void 0, function* () {
        const methodName = 'main';
        console.error(`${moduleName}#${methodName}: Starting...`);
        const connection = mysql.createConnection({
            host: '192.168.0.212',
            user: `akeneo_pimee`,
            password: process.env.EX_MYSQL_PASSWORD || 'akeneo_pimee',
            database,
            supportBigNumbers: true,
            bigNumberStrings: true
        });
        connection.connect();
        let results;
        const cla = argz(args);
        const tasks = cla.tasks;
        if (tasks.ids) {
            results = yield tablesAndIDColumns(connection);
            // console.log(results);
            let columnNames;
            columnNames = [];
            let tableName;
            tableName = results.results[0].TABLE_NAME;
            const tables = new Map();
            for (const result of results.results) {
                if (tableName !== result.TABLE_NAME) {
                    tables.set(tableName, columnNames);
                    columnNames = [];
                    tableName = result.TABLE_NAME;
                }
                columnNames.push(result.COLUMN_NAME);
            }
            tables.set(tableName, columnNames);
            // console.log(tables);
            results = yield ids(connection, tables);
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
            results = yield tablesAndColumns(connection);
            // console.log(results);
            let columnNames;
            columnNames = [];
            let tableName;
            tableName = results.results[0].TABLE_NAME;
            const tables = new Map();
            for (const result of results.results) {
                if (tableName !== result.TABLE_NAME) {
                    tables.set(tableName, columnNames);
                    columnNames = [];
                    tableName = result.TABLE_NAME;
                }
                columnNames.push(result.COLUMN_NAME);
            }
            tables.set(tableName, columnNames);
            results = yield counts(connection, tables);
            // console.log(results);
            for (const property in results.tables) {
                if (results.tables.hasOwnProperty(property)) {
                    console.log(`${property}\t${results.tables[property]}`);
                }
            }
        }
        if (tasks.search) {
            results = yield tablesAndStringColumns(connection);
            // console.log(results);
            let columnNames;
            columnNames = [];
            let tableName;
            tableName = results.results[0].TABLE_NAME;
            const tables = new Map();
            for (const result of results.results) {
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
            results = yield search(connection, tables, localSearch, cla.like);
            // console.log(results);
            for (const row of results.rows) {
                let str = ``;
                for (const col in row) {
                    str += `${col}\t${row[col]}\t`;
                }
                console.log(str);
            }
        }
        connection.end();
    });
}
exports.default = main;
// Start the program
if (require.main === module) {
    main();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsV0FBVzs7Ozs7Ozs7OztBQUVYLHlCQUF5QjtBQUN6QixxQ0FBcUM7QUFDckMsK0JBQStCO0FBQy9CLDZCQUE2QjtBQUU3QixNQUFNLFFBQVEsR0FBWSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQXlCLElBQUksWUFBWSxDQUFDO0FBQ2hGLHlGQUF5RjtBQUN6RixNQUFNLFVBQVUsR0FBVyxPQUFPLENBQUM7QUFDbkMsTUFBTSxhQUFhLEdBQVU7SUFDM0IsUUFBUTtJQUNSLEtBQUs7SUFDTCxRQUFRO0NBQ1QsQ0FBQztBQUVGLDhEQUE4RDtBQUM5RCxpQkFBaUIsR0FBUSxFQUFFLFFBQWdCLENBQUM7SUFDMUMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQy9DLENBQUM7QUFFRCxjQUFjLE9BQVksSUFBSTtJQUM1QixNQUFNLFVBQVUsR0FBVyxNQUFNLENBQUM7SUFFbEMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLFVBQVUsSUFBSSxVQUFVLGVBQWUsQ0FBQyxDQUFDO0lBRTFELE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDN0IsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTlDLE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDakYsS0FBSyxFQUFFO1lBQ0wsQ0FBQyxFQUFFLE1BQU07WUFDVCxDQUFDLEVBQUUsTUFBTTtZQUNULENBQUMsRUFBRSxRQUFRO1lBQ1gsQ0FBQyxFQUFFLE9BQU87WUFDVixDQUFDLEVBQUUsU0FBUztTQUNiO1FBQ0QsT0FBTyxFQUFFO1lBQ1AsQ0FBQyxFQUFFLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1NBQzNCO0tBQ0YsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxHQUFHLEdBQVMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDekUsTUFBTSxJQUFJLEdBQVcsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQzlDLE1BQU0sT0FBTyxHQUFXLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUN2RCxJQUFJLFNBQVMsQ0FBQyxPQUFPLEVBQUU7UUFDckIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDMUIsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNqQjtJQUNELElBQUksU0FBUyxDQUFDLElBQUksRUFBRTtRQUNsQixPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN4QixPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixJQUFJLHVCQUF1QixDQUFDLENBQUM7UUFDbkUsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0Q0FBNEMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDckYsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsSUFBSSxVQUFVLENBQUMsQ0FBQztRQUN0RCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ2pCO0lBQ0QsTUFBTSxJQUFJLEdBQVksU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7SUFDcEQsTUFBTSxNQUFNLEdBQVcsU0FBUyxDQUFDLE1BQU0sQ0FBQztJQUN4QyxNQUFNLE1BQU0sR0FBUSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQ2hELE1BQU0sS0FBSyxHQUFVLFNBQVMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hELE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDckIsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUU7UUFDeEIsSUFBSSxLQUFLLEdBQVksS0FBSyxDQUFDO1FBQzNCLEtBQUssTUFBTSxZQUFZLElBQUksYUFBYSxFQUFFO1lBQ3hDLElBQUksWUFBWSxLQUFLLElBQUksRUFBRTtnQkFDekIsS0FBSyxHQUFHLElBQUksQ0FBQztnQkFDYixNQUFNO2FBQ1A7U0FDRjtRQUNELElBQUksS0FBSyxFQUFFO1lBQ1QsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7U0FDM0I7YUFBTTtZQUNMLE9BQU8sQ0FBQyxLQUFLLENBQUMsU0FBUyxJQUFJLDRDQUE0QyxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwRyxVQUFVLENBQUMsR0FBRyxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztTQUMvQztLQUNGO0lBQ0QsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQztBQUVELDBCQUEwQixJQUFTO0lBQ2pDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDckMsTUFBTSxNQUFNLEdBQVEsRUFBRSxDQUFDO1FBRXZCLElBQUksQ0FBQyxLQUFLLENBQUM7Ozs7K0JBSWdCLFFBQVE7O0tBRWxDLEVBQUUsQ0FBQyxLQUFVLEVBQUUsT0FBWSxFQUFFLE1BQVcsRUFBRSxFQUFFO1lBQzNDLElBQUksS0FBSyxFQUFFO2dCQUNULE1BQU0sQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO2dCQUNyQixPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDNUIsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7YUFDdkI7aUJBQU07Z0JBQ0wsTUFBTSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7Z0JBQ3pCLE1BQU0sQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO2dCQUN2QixPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQzthQUN4QjtRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsNEJBQTRCLElBQVM7SUFDbkMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUNyQyxNQUFNLE1BQU0sR0FBUSxFQUFFLENBQUM7UUFFdkIsSUFBSSxDQUFDLEtBQUssQ0FBQzs7OzsrQkFJZ0IsUUFBUTs7OztLQUlsQyxFQUFFLENBQUMsS0FBVSxFQUFFLE9BQVksRUFBRSxNQUFXLEVBQUUsRUFBRTtZQUMzQyxJQUFJLEtBQUssRUFBRTtnQkFDVCxNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztnQkFDckIsT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzVCLE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2FBQ3ZCO2lCQUFNO2dCQUNMLE1BQU0sQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO2dCQUN6QixNQUFNLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztnQkFDdkIsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7YUFDeEI7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVELGdDQUFnQyxJQUFTO0lBQ3ZDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDckMsTUFBTSxNQUFNLEdBQVEsRUFBRSxDQUFDO1FBRXZCLElBQUksQ0FBQyxLQUFLLENBQUM7Ozs7K0JBSWdCLFFBQVE7OztLQUdsQyxFQUFFLENBQUMsS0FBVSxFQUFFLE9BQVksRUFBRSxNQUFXLEVBQUUsRUFBRTtZQUMzQyxJQUFJLEtBQUssRUFBRTtnQkFDVCxNQUFNLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztnQkFDckIsT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzVCLE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2FBQ3ZCO2lCQUFNO2dCQUNMLE1BQU0sQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO2dCQUN6QixNQUFNLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztnQkFDdkIsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7YUFDeEI7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVELGdCQUFzQixJQUFTLEVBQUUsTUFBVzs7UUFDMUMsTUFBTSxPQUFPLEdBQVEsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUM7UUFFcEMsSUFBSSxDQUFDLEdBQVcsQ0FBQyxDQUFDO1FBQ2xCLEtBQUssTUFBTSxTQUFTLElBQUksTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFO1lBQ3JDLElBQUksR0FBVyxDQUFDO1lBQ2hCLEdBQUcsR0FBRyxxQ0FBcUMsUUFBUSxNQUFNLFNBQVMsSUFBSSxDQUFDO1lBRXZFLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFbkIsSUFBSTtnQkFDRixNQUFNLElBQUksR0FBUSxNQUFNLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQzFDLHVCQUF1QjtnQkFDdkIsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUU7b0JBQ3RCLElBQUksR0FBRyxDQUFDLEtBQUssSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRTt3QkFDbkMsTUFBTSxLQUFLLEdBQVcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7d0JBQzVELE9BQU8sQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsS0FBSyxDQUFDO3FCQUNuQztpQkFDRjthQUNGO1lBQUMsT0FBTyxHQUFHLEVBQUU7Z0JBQ1osT0FBTyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUM7Z0JBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM3QixPQUFPLE9BQU8sQ0FBQzthQUNoQjtTQUNGO1FBQ0QsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztDQUFBO0FBRUQsYUFBbUIsSUFBUyxFQUFFLE1BQVc7O1FBQ3ZDLE1BQU0sT0FBTyxHQUFRLEVBQUUsR0FBRyxFQUFFLElBQUksR0FBRyxFQUFFLEVBQUUsQ0FBQztRQUV4QyxJQUFJLENBQUMsR0FBVyxDQUFDLENBQUM7UUFDbEIsS0FBSyxNQUFNLFNBQVMsSUFBSSxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUU7WUFDckMsSUFBSSxHQUFXLENBQUM7WUFDaEIsS0FBSyxNQUFNLFVBQVUsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFO2dCQUM5QyxHQUFHLEdBQUcscUJBQXFCLFVBQVUsaUJBQWlCLFFBQVEsTUFBTSxTQUFTLElBQUksQ0FBQztnQkFFbEYsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFFbkIsTUFBTSxLQUFLLEdBQVcsR0FBRyxTQUFTLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQ3BELElBQUk7b0JBQ0YsTUFBTSxJQUFJLEdBQVEsTUFBTSxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUMxQyx1QkFBdUI7b0JBQ3ZCLEtBQUssTUFBTSxHQUFHLElBQUksSUFBSSxFQUFFO3dCQUN0QixJQUFJLEdBQUcsQ0FBQyxFQUFFLElBQUksR0FBRyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUU7NEJBQzdCLE1BQU0sRUFBRSxHQUFXLElBQUksR0FBRyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDOzRCQUN4RCxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFO2dDQUN2QixJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFO29DQUNuQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7aUNBQ2hDOzZCQUNGO2lDQUFNO2dDQUNMLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxJQUFJLEdBQUcsQ0FBQyxDQUFFLEtBQUssQ0FBRSxDQUFDLENBQUMsQ0FBQzs2QkFDekM7NEJBQ0QsaUJBQWlCOzRCQUNqQixXQUFXOzRCQUNYLElBQUk7eUJBQ0w7cUJBQ0Y7aUJBQ0Y7Z0JBQUMsT0FBTyxHQUFHLEVBQUU7b0JBQ1osT0FBTyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUM7b0JBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUM3QixPQUFPLE9BQU8sQ0FBQztpQkFDaEI7YUFDRjtZQUNELG9CQUFvQjtZQUNwQixXQUFXO1lBQ1gsSUFBSTtTQUNMO1FBQ0QsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztDQUFBO0FBRUQsZ0JBQXNCLElBQVMsRUFBRSxNQUFXLEVBQUUsTUFBYyxFQUFFLEVBQUUsT0FBZ0IsS0FBSzs7UUFDbkYsTUFBTSxPQUFPLEdBQVEsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUM7UUFFbEMscUJBQXFCO1FBQ3JCLEtBQUssTUFBTSxTQUFTLElBQUksTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFO1lBQ3JDLElBQUksR0FBRyxHQUFXOzBCQUNJLFNBQVM7ZUFDcEIsUUFBUSxNQUFNLFNBQVM7Y0FDeEIsQ0FBQztZQUVYLEtBQUssTUFBTSxVQUFVLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRTtnQkFDOUMsR0FBRyxJQUFJLFdBQVcsVUFBVSxVQUFVLEdBQUcsa0JBQWtCLENBQUM7Z0JBQzVELElBQUksSUFBSSxFQUFFO29CQUNSLEdBQUcsSUFBSSxXQUFXLFVBQVUsYUFBYSxHQUFHLG9CQUFvQixDQUFDO29CQUNqRSxHQUFHLElBQUksV0FBVyxVQUFVLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQztvQkFDbkUsR0FBRyxJQUFJLFdBQVcsVUFBVSxlQUFlLEdBQUcsa0JBQWtCLENBQUM7aUJBQ2xFO2FBQ0Y7WUFDRCxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN4QixPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRW5CLElBQUk7Z0JBQ0YsTUFBTSxNQUFNLEdBQVEsTUFBTSxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUM1QyxPQUFPLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2FBQzVDO1lBQUMsT0FBTyxHQUFHLEVBQUU7Z0JBQ1osT0FBTyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUM7Z0JBQ3BCLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM3QixPQUFPLE9BQU8sQ0FBQzthQUNoQjtTQUNGO1FBQ0QsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztDQUFBO0FBRUQsZ0JBQWdCLElBQVMsRUFBRSxHQUFXO0lBQ3BDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDckMsSUFBSSxPQUFZLENBQUM7UUFFakIsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFVLEVBQUUsSUFBUyxFQUFFLE1BQVcsRUFBRSxFQUFFO1lBQ3JELElBQUksS0FBSyxFQUFFO2dCQUNULE9BQU8sR0FBRyxLQUFLLENBQUM7Z0JBQ2hCLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3ZCLE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2FBQ3hCO2lCQUFNO2dCQUNMLE9BQU8sR0FBRyxJQUFJLENBQUM7Z0JBQ2Ysd0JBQXdCO2dCQUN4QixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQzthQUN6QjtRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsY0FBbUMsR0FBRyxJQUFXOztRQUMvQyxNQUFNLFVBQVUsR0FBVyxNQUFNLENBQUM7UUFDbEMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLFVBQVUsSUFBSSxVQUFVLGVBQWUsQ0FBQyxDQUFDO1FBQzFELE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQztZQUN4QyxJQUFJLEVBQU8sZUFBZTtZQUMxQixJQUFJLEVBQU8sY0FBYztZQUN6QixRQUFRLEVBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBNEIsSUFBSSxjQUFjO1lBQ3RFLFFBQVE7WUFDUixpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGdCQUFnQixFQUFFLElBQUk7U0FDdkIsQ0FBQyxDQUFDO1FBQ0gsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRXJCLElBQUksT0FBWSxDQUFDO1FBQ2pCLE1BQU0sR0FBRyxHQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QixNQUFNLEtBQUssR0FBUSxHQUFHLENBQUMsS0FBSyxDQUFDO1FBRTdCLElBQUksS0FBSyxDQUFDLEdBQUcsRUFBRTtZQUNiLE9BQU8sR0FBRyxNQUFNLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQy9DLHdCQUF3QjtZQUN4QixJQUFJLFdBQWtCLENBQUM7WUFDdkIsV0FBVyxHQUFHLEVBQUUsQ0FBQztZQUNqQixJQUFJLFNBQWlCLENBQUM7WUFDdEIsU0FBUyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO1lBQzFDLE1BQU0sTUFBTSxHQUEwQixJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQ2hELEtBQUssTUFBTSxNQUFNLElBQUksT0FBTyxDQUFDLE9BQU8sRUFBRTtnQkFDcEMsSUFBSSxTQUFTLEtBQUssTUFBTSxDQUFDLFVBQVUsRUFBRTtvQkFDbkMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7b0JBQ25DLFdBQVcsR0FBRyxFQUFFLENBQUM7b0JBQ2pCLFNBQVMsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDO2lCQUMvQjtnQkFDRCxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQzthQUN0QztZQUNELE1BQU0sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBRW5DLHVCQUF1QjtZQUV2QixPQUFPLEdBQUcsTUFBTSxHQUFHLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3hDLE1BQU0sSUFBSSxHQUFVLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ25ELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNaLHdCQUF3QjtZQUN4QixLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRTtnQkFDdEIsd0NBQXdDO2dCQUN4QyxNQUFNLE1BQU0sR0FBVSxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7Z0JBQ2hFLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDZCxLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRTtvQkFDMUIsOENBQThDO29CQUM5QyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxLQUFLLEtBQUssRUFBRSxDQUFDLENBQUM7aUJBQ2pDO2FBQ0Y7U0FDRjtRQUVELElBQUksS0FBSyxDQUFDLE1BQU0sRUFBRTtZQUNoQixPQUFPLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUM3Qyx3QkFBd0I7WUFDeEIsSUFBSSxXQUFrQixDQUFDO1lBQ3ZCLFdBQVcsR0FBRyxFQUFFLENBQUM7WUFDakIsSUFBSSxTQUFpQixDQUFDO1lBQ3RCLFNBQVMsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztZQUMxQyxNQUFNLE1BQU0sR0FBMEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNoRCxLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLEVBQUU7Z0JBQ3BDLElBQUksU0FBUyxLQUFLLE1BQU0sQ0FBQyxVQUFVLEVBQUU7b0JBQ25DLE1BQU0sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFDO29CQUNuQyxXQUFXLEdBQUcsRUFBRSxDQUFDO29CQUNqQixTQUFTLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQztpQkFDL0I7Z0JBQ0QsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7YUFDdEM7WUFDRCxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztZQUVuQyxPQUFPLEdBQUcsTUFBTSxNQUFNLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzNDLHdCQUF3QjtZQUN4QixLQUFLLE1BQU0sUUFBUSxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUU7Z0JBQ3JDLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLEVBQUU7b0JBQzNDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxRQUFRLEtBQUssT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7aUJBQ3pEO2FBQ0Y7U0FDRjtRQUVELElBQUksS0FBSyxDQUFDLE1BQU0sRUFBRTtZQUNoQixPQUFPLEdBQUcsTUFBTSxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNuRCx3QkFBd0I7WUFDeEIsSUFBSSxXQUFrQixDQUFDO1lBQ3ZCLFdBQVcsR0FBRyxFQUFFLENBQUM7WUFDakIsSUFBSSxTQUFpQixDQUFDO1lBQ3RCLFNBQVMsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztZQUMxQyxNQUFNLE1BQU0sR0FBMEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNoRCxLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sQ0FBQyxPQUFPLEVBQUU7Z0JBQ3BDLElBQUksU0FBUyxLQUFLLE1BQU0sQ0FBQyxVQUFVLEVBQUU7b0JBQ25DLE1BQU0sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFDO29CQUNuQyxXQUFXLEdBQUcsRUFBRSxDQUFDO29CQUNqQixTQUFTLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQztpQkFDL0I7Z0JBQ0QsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7YUFDdEM7WUFDRCxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztZQUVuQyx1QkFBdUI7WUFDdkIsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNuQixNQUFNLFdBQVcsR0FBVyxHQUFHLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDakcsT0FBTyxHQUFHLE1BQU0sTUFBTSxDQUFDLFVBQVUsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNsRSx3QkFBd0I7WUFDeEIsS0FBSyxNQUFNLEdBQUcsSUFBSSxPQUFPLENBQUMsSUFBSSxFQUFFO2dCQUM5QixJQUFJLEdBQUcsR0FBVyxFQUFFLENBQUM7Z0JBQ3JCLEtBQUssTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFO29CQUNyQixHQUFHLElBQUksR0FBRyxHQUFHLEtBQUssR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUM7aUJBQ2hDO2dCQUNELE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDbEI7U0FDRjtRQUVELFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNuQixDQUFDO0NBQUE7QUFoSEQsdUJBZ0hDO0FBRUQsb0JBQW9CO0FBQ3BCLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7SUFDM0IsSUFBSSxFQUFFLENBQUM7Q0FDUiJ9