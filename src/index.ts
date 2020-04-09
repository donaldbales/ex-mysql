// index.ts

import * as fs from 'fs';
import * as minimist from 'minimist';
import * as mysql from 'mysql';
import * as util from 'util';

const database: string = (process.env.MYSQL_DATABASE as string) || 'akeneo_pim';
// const database: string = (process.env.MYSQL_DATABASE as string) || 'staplescom26_pdb';
const moduleName: string = 'index';
const possibleTasks: any[] = [
  'counts',
  'ids',
  'search'
];

// I create this function to make it easy to develop and debug
function inspect(obj: any, depth: number = 5) {
  return util.inspect(obj, true, depth, false);
}

function argz(args: any = null): any {
  const methodName: string = 'argz';

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
  const pkg: any  = JSON.parse(fs.readFileSync('package.json').toString());
  const name: string = pkg.name ? pkg.name : '';
  const version: string = pkg.version ? pkg.version : '';
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
  const like: boolean = localArgs.like ? true : false;
  const search: string = localArgs.search;
  const result: any = { like, search, tasks: {} };
  const tasks: any[] = localArgs.tasks.split(',');
  console.error(tasks);
  for (const task of tasks) {
    let found: boolean = false;
    for (const possibleTask of possibleTasks) {
      if (possibleTask === task) {
        found = true;
        break;
      }
    }
    if (found) {
      result.tasks[task] = true;
    } else {
      console.error(`Task: ${task}, is not in the list of supported tasks: ${possibleTasks.join(', ')}.`);
      setTimeout(() => { process.exit(1); }, 10000);
    }
  }
  return result;
}

function tablesAndColumns(conn: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const result: any = {};

    conn.query(`
      select TABLE_NAME,
             COLUMN_NAME
      from   INFORMATION_SCHEMA.COLUMNS
      where  TABLE_SCHEMA = '${database}'
      order by 1, 2
    `, (error: any, results: any, fields: any) => {
      if (error) {
        result.error = error;
        console.error(result.error);
        return reject(result);
      } else {
        result.results = results;
        result.fields = fields;
        return resolve(result);
      }
    });
  });  
}

function tablesAndIDColumns(conn: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const result: any = {};

    conn.query(`
      select TABLE_NAME,
             COLUMN_NAME
      from   INFORMATION_SCHEMA.COLUMNS
      where  TABLE_SCHEMA = '${database}'
      and   (lower(COLUMN_NAME) like '%_id'
      or     lower(COLUMN_NAME) = 'sku')
      order by 1, 2
    `, (error: any, results: any, fields: any) => {
      if (error) {
        result.error = error;
        console.error(result.error);
        return reject(result);
      } else {
        result.results = results;
        result.fields = fields;
        return resolve(result);
      }
    });
  });  
}

function tablesAndStringColumns(conn: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const result: any = {};

    conn.query(`
      select TABLE_NAME,
             COLUMN_NAME
      from   INFORMATION_SCHEMA.COLUMNS
      where  TABLE_SCHEMA = '${database}'
      and    DATA_TYPE in ('char', 'mediumtext', 'text', 'tinytext', 'varchar')
      order by 1, 2
    `, (error: any, results: any, fields: any) => {
      if (error) {
        result.error = error;
        console.error(result.error);
        return reject(result);
      } else {
        result.results = results;
        result.fields = fields;
        return resolve(result);
      }
    });
  });  
}

async function counts(conn: any, tables: any): Promise<any> {
  const results: any = { tables: {} }; 

  let i: number = 0;
  for (const tableName of tables.keys()) {
    let sql: string;
    sql = `select count(1) as \`count\` from ${database}.\`${tableName}\``;

    console.error(sql);

    try {
      const rows: any = await select(conn, sql);
      // console.error(rows);
      for (const row of rows) {
        if (row.count && row.count.toString) {
          const count: string = `${row.count.toString().trimRight()}`;
          results.tables[tableName] = count;
        }
      }
    } catch (err) {
      results.error = err;
      console.error(results.error);
      return results;
    }
  }
  return results;
}

async function ids(conn: any, tables: any): Promise<any> {
  const results: any = { ids: new Map() }; 

  let i: number = 0;
  for (const tableName of tables.keys()) {
    let sql: string;
    for (const columnName of tables.get(tableName)) {
      sql = `select distinct \`${columnName}\` as ID from ${database}.\`${tableName}\``;

      console.error(sql);

      const value: string = `${tableName}\t${columnName}`;
      try {
        const rows: any = await select(conn, sql);
        // console.error(rows);
        for (const row of rows) {
          if (row.ID && row.ID.toString) {
            const id: string = `"${row.ID.toString().trimRight()}"`;
            if (results.ids.has(id)) {
              if (!results.ids.get(id).has(value)) {
                results.ids.get(id).add(value);
              }
            } else {
              results.ids.set(id, new Set([ value ]));
            }
            // if (++i > 5) {
            //   break;
            // }
          }
        }
      } catch (err) {
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
}

async function search(conn: any, tables: any, str: string = '', like: boolean = false): Promise<any> {
  const results: any = { rows: [] };

  // let i: number = 0;
  for (const tableName of tables.keys()) {
    let sql: string = `
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
      const result: any = await select(conn, sql);
      results.rows = results.rows.concat(result);
    } catch (err) {
      results.error = err;
      console.error(results.error);
      return results;
    }
  }
  return results;
}

function select(conn: any, sql: string): Promise<any> {
  return new Promise((resolve, reject) => {
    let results: any;
    
    conn.query(sql, (error: any, rows: any, fields: any) => {
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

export default async function main(...args: any[]): Promise<any> {
  const methodName: string = 'main';
  console.error(`${moduleName}#${methodName}: Starting...`);
  const connection = mysql.createConnection({
    host     : '192.168.0.212',
    user     : `akeneo_pimee`,
    password : (process.env.EX_MYSQL_PASSWORD as string) || 'akeneo_pimee',
    database,
    supportBigNumbers: true,
    bigNumberStrings: true
  });
  connection.connect();

  let results: any;
  const cla: any = argz(args);
  const tasks: any = cla.tasks;
  
  if (tasks.ids) {    
    results = await tablesAndIDColumns(connection);
    // console.log(results);
    let columnNames: any[];
    columnNames = [];
    let tableName: string;
    tableName = results.results[0].TABLE_NAME;
    const tables: Map<string, string[]> = new Map();
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

    results = await ids(connection, tables);
    const keys: any[] = Array.from(results.ids.keys());
    keys.sort();
    // console.log(results);
    for (const key of keys) {
      // console.error(`id=${id.toString()}`);
      const values: any[] = Array.from(results.ids.get(key).values());
      values.sort();
      for (const value of values) {
        // console.error(`value=${value.toString()}`);
        console.log(`${key}\t${value}`);
      }
    }
  }

  if (tasks.counts) {    
    results = await tablesAndColumns(connection);
    // console.log(results);
    let columnNames: any[];
    columnNames = [];
    let tableName: string;
    tableName = results.results[0].TABLE_NAME;
    const tables: Map<string, string[]> = new Map();
    for (const result of results.results) {
      if (tableName !== result.TABLE_NAME) {
        tables.set(tableName, columnNames);
        columnNames = [];
        tableName = result.TABLE_NAME;
      } 
      columnNames.push(result.COLUMN_NAME);
    }
    tables.set(tableName, columnNames);

    results = await counts(connection, tables);
    // console.log(results);
    for (const property in results.tables) {
      if (results.tables.hasOwnProperty(property)) {
        console.log(`${property}\t${results.tables[property]}`);
      }
    }
  }

  if (tasks.search) {    
    results = await tablesAndStringColumns(connection);
    // console.log(results);
    let columnNames: any[];
    columnNames = [];
    let tableName: string;
    tableName = results.results[0].TABLE_NAME;
    const tables: Map<string, string[]> = new Map();
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
    const localSearch: string = cla.search && cla.search.toLowerCase ? cla.search.toLowerCase() : '';
    results = await search(connection, tables, localSearch, cla.like);
    // console.log(results);
    for (const row of results.rows) {
      let str: string = ``;
      for (const col in row) {
        str += `${col}\t${row[col]}\t`;
      }
      console.log(str);
    }
  }

  connection.end();
}

// Start the program
if (require.main === module) {
  main();
}
