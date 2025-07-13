const axios = require('axios');

let config = {
  method: 'get',
  url: 'https://api-testnet.bybit.com/v5/account/info',
  headers: { 
    'X-BAPI-API-KEY': 'esUvA3iyrimc8nVihB', 
    'X-BAPI-TIMESTAMP': '1752295111543', 
    'X-BAPI-RECV-WINDOW': '20000', 
    'X-BAPI-SIGN': '09ed59b76b3560dccfa27c94a2c897b3e919e6cbe11234f0b52c3c29ba2bf887'
  }
};

axios(config)
.then((response) => {
  console.log(JSON.stringify(response.data));
})
.catch((error) => {
  console.log(error);
});