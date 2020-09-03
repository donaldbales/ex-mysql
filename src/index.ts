// index.ts

import * as bunyan from 'bunyan';
import Logger from 'bunyan';
import * as fs from 'fs';
import * as minimist from 'minimist';
import * as util from 'util';

import * as sql from './sql';


const moduleName: string = 'index';

const database: string = (process.env.MYSQL_DATABASE as string) || '';

const possibleTasks: any[] = [
  'counts',
  'histograms',
  'ids',
  'search'
];

// I create this function to make it easy to develop and debug
function inspect(obj: any, depth: number = 5) {
  return util.inspect(obj, true, depth, false);
}

function argz(args: any = null): any {
  const methodName: string = 'argz';

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

function formatTableName(catalog: string, schema: string, table: string): string {
  return `${catalog}.${table}`;
}

async function tablesAndColumns(logger: any, conn: any): Promise<any> {
  let results: any = [];
  
  const query: string = `
      select TABLE_NAME,
             COLUMN_NAME
      from   INFORMATION_SCHEMA.COLUMNS
      where  TABLE_SCHEMA = '${database}'
      order by 1, 2`;
  
  try {
    results = await sql.executeDML(logger, conn, query); 
  } catch (err) {
    logger.error({ err });
    process.exit(99);
  }

  return results;
}

async function tablesAndIDColumns(logger: any, conn: any): Promise<any> {
  let results: any = [];

  const query: string = `
    select TABLE_NAME,
           COLUMN_NAME
    from   INFORMATION_SCHEMA.COLUMNS
    where  TABLE_SCHEMA = '${database}'
    and   (lower(COLUMN_NAME) like '%_id'
    or     lower(COLUMN_NAME) = 'sku')
    order by 1, 2`;
  
  try {
    results = await sql.executeDML(logger, conn, query); 
  } catch (err) {
    logger.error({ err });
    process.exit(99);
  }

  return results;
}

async function tablesAndStringColumns(logger: any, conn: any): Promise<any> {
  let results: any = [];

  const query: string = `
      select TABLE_NAME,
             COLUMN_NAME
      from   INFORMATION_SCHEMA.COLUMNS
      where  TABLE_SCHEMA = '${database}'
      and    DATA_TYPE in ('char', 'mediumtext', 'text', 'tinytext', 'varchar')
      order by 1, 2`;
  
  try {
    results = await sql.executeDML(logger, conn, query); 
  } catch (err) {
    logger.error({ err });
    process.exit(99);
  }

  return results;
}

async function counts(logger: any, conn: any, tables: any): Promise<any> {
  const results: any = { tables: {} }; 

  let i: number = 0;
  for (const tableName of tables.keys()) {
    let query: string;
    query = `select count(1) as \`count\` from ${database}.\`${tableName}\``;

    console.error(query);

    try {
      // const rows: any = await sql.executeDML(logger, conn, query);
      const rows: any = await sql.executeDML(logger, conn, query);
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

async function histograms(logger: any, conn: any, tables: any): Promise<any> {  
  const results: any = { tables: {} }; 

  for (const tableName of tables.keys()) {
    console.error(`/** ${tableName} */`);
    
    results.tables[tableName] = [];

    for (const columnName of tables.get(tableName)) {
      console.error(`/*** ${columnName} */`);
      
      if (columnName === 'next_val') {
        continue;
      } else
      if (tableName === 'H70_AUDITTRAIL.dbo.sysdiagrams' &&
          columnName === 'definition') {
        continue;
      }

      let query: string;
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
        const rows: any = await sql.executeDML(logger, conn, query);
        
        for (const row of rows) {
          if (row.count && row.count.toString) {
            results.tables[tableName].push(row);
          }
        }
      } catch (err) {
        results.tables[tableName].push(err.error.message);
      }
      // break;
    }  
    // break;
  }
  return results;
}

async function ids(logger: any, conn: any, tables: any): Promise<any> {
  const results: any = { ids: new Map() }; 

  let i: number = 0;
  for (const tableName of tables.keys()) {
    let query: string;
    for (const columnName of tables.get(tableName)) {
      query = `select distinct \`${columnName}\` as ID from ${database}.\`${tableName}\``;

      console.error(query);

      const value: string = `${tableName}\t${columnName}`;
      try {
        const rows: any = await sql.executeDML(logger, conn, query);
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

async function search(logger: any, conn: any, tables: any, str: string = '', like: boolean = false): Promise<any> {
  const results: any = { rows: [] };

  // let i: number = 0;
  for (const tableName of tables.keys()) {
    let query: string = `
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
      const result: any = await sql.executeDML(logger, conn, query);
      // console.log(inspect(result));
      results.rows = results.rows.concat(result);
    } catch (err) {
      results.error = err;
      console.error(results.error);
      return results;
    }
  }
  return results;
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
export default async function main(...args: any[]): Promise<any> {
  const methodName: string = 'main';
  const logger: Logger = bunyan.createLogger({ "name": "ex-mssql" });
  logger.level('error');
  logger.info(`${moduleName}#${methodName}: Starting...`);

  let results: any;
  const cla: any = argz(args);
  const tasks: any = cla.tasks;

  let conn = null;  
  try {
    conn = await sql.connect(logger);
    logger.info(`${moduleName}#${methodName}: Connected...`);
  } catch (err) {
    logger.error(`${moduleName}#${methodName}: ${inspect(err)}`);
  }
  
  if (tasks.ids) {    
    results = await tablesAndIDColumns(logger, conn);
    // console.log(results);
    let columnNames: any[];
    columnNames = [];
    let tableName: string;
    tableName = results[0].TABLE_NAME;
    const tables: Map<string, string[]> = new Map();
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

    results = await ids(logger, conn, tables);
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
    results = await tablesAndColumns(logger, conn);
    // console.log(results);
    let columnNames: any[];
    columnNames = [];
    let tableName: string;
    tableName = results[0].TABLE_NAME;
    const tables: Map<string, string[]> = new Map();
    for (const result of results) {
      if (tableName !== result.TABLE_NAME) {
        tables.set(tableName, columnNames);
        columnNames = [];
        tableName = result.TABLE_NAME;
      } 
      columnNames.push(result.COLUMN_NAME);
    }
    tables.set(tableName, columnNames);

    results = await counts(logger, conn, tables);
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
    const tableCatalogs: any[] = [ database ];
    /*
    for (const result of results) {
      tableCatalogs.push(result.name);
    }
    */
    
    for (const tableCatalog of tableCatalogs) {
      results = await sql.executeDML(logger, conn, `use ${tableCatalog}`, []);
      
      results = await tablesAndColumns(logger, conn);
      
      let columnNames: any[] = [];
      let tableName: string = formatTableName(tableCatalog, results[0].TABLE_SCHEMA, results[0].TABLE_NAME);
      const tables: Map<string, string[]> = new Map();
      
      for (const result of results) {
        if (tableName !== formatTableName(tableCatalog, result.TABLE_SCHEMA, result.TABLE_NAME)) {
          tables.set(tableName, columnNames);
          columnNames = [];
          tableName = formatTableName(tableCatalog, result.TABLE_SCHEMA, result.TABLE_NAME);
        } 
        columnNames.push(result.COLUMN_NAME);
      }
      tables.set(tableName, columnNames);

      results = await histograms(logger, conn, tables);

      // console.log(inspect(results));
      // process.exit(1);

      for (const property in results.tables) {
        // console.log(`* ${property}`);
        
        if (results.tables.hasOwnProperty(property)) {          
          const tableName: string = property;
          let columnName: string = '';
          let columnValue: string = '';
          let count: string = '';
          let rowCount: number = 0;
          let lastColumnName: string = '';
          for (const row of results.tables[property]) {
            // console.log(`** ${inspect(row)}`);
            
            let property2Count: number = 0;
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
                } else
                if (property2Count === 2) {
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
    results = await tablesAndColumns(logger, conn);
    // console.log(results);
    let columnNames: any[];
    columnNames = [];
    let tableName: string;
    tableName = results[0].TABLE_NAME;
    const tables: Map<string, string[]> = new Map();
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
    const localSearch: string = cla.search && cla.search.toLowerCase ? cla.search.toLowerCase() : '';
    results = await search(logger, conn, tables, localSearch, cla.like);
    // console.log(results);
    for (const row of results.rows) {
      let str: string = ``;
      for (const col in row) {
        str += `${col}\t${row[col]}\t`;
      }
      console.log(str);
    }
  }

  conn.end();
}

// Start the program
if (require.main === module) {
  main();
}
