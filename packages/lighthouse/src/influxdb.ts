import * as influx from 'influx';
import { IDB, IDBPayload } from './types';
import Logger from './logger';
const console = new Logger('[DB Connector]: ');


// DB instance
const DBNAME = 'lighthouse';
const DB = new influx.InfluxDB({
  host: process.env.HOST || 'localhost',
  database: DBNAME
});

const client = require('prom-client');




export default {
  init: async () => {
    try {
      const names = await DB.getDatabaseNames();
      if (names.indexOf(DBNAME) === -1) {
        console.log('Database does not exist. Creating database');
        return DB.createDatabase(DBNAME);
      }
      console.log('Database exist. Connection ready');
      return Promise.resolve();
    } catch (err) {
      return Promise.reject('Database: Failed to initialise Connection');
    }
  },
  saveData: async (url: any, data: IDBPayload) => {
    const urlObject = new URL(url);
    const hostName = urlObject.hostname;
    console.log('Url is' + hostName)

    const Registry = client.Registry;
    const register = new Registry();
    const gateway = new client.Pushgateway(process.env.PROMETHEUS || 'http://127.0.0.1:9091', [], register);
    const prefix = 'lighthouse';

    try {
      const points = Object.keys(data).reduce((points, key) => {
        if (data[key]){
          points.push({ measurement: key, tags: { url }, fields: { value: data[key] } });

          new client.Gauge({
            name: key.replace(/-/g,'_'),
            help: key,
            registers: [register],
            collect() {
              // Invoked when the registry collects its metrics' values.
              // This can be synchronous or it can return a promise/be an async function.
              this.set(+data[key]);
            },
          });
        }
        return points;
      }, []);
      const result = await DB.writePoints(points);



      gateway
          .push({ jobName: prefix ,groupings: { url : hostName }})
          .then(({ resp, body }) => {
            console.log(`Body: ${body}`);
            console.log(`Response status: ${resp.statusCode}`);
          })
          .catch(err => {
            console.log(`Error: ${err}`);
          });

      console.log(`Successfully saved lighthouse data for ${url}`);
      return result;
    } catch (err) {
      console.log(`Failed to save lighthouse data for ${url} ${err}`);
    }
  }
} as IDB;
