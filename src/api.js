const API_KEY =
  "eeb255d1edccb58e6ffd64c87d5b26e54c6346ef4b6e1cc8faa4c3d053834a0f";
const AGGREGATE_INDEX = "5";
const ERROR = "500";
const TOO_MANY_SOCKETS = "429";
const BTC = "BTC";
const USD = "USD";
const tickerHandlers = new Map();
const crossChangeTickers = new Map();
const socket = new WebSocket(
  `wss://streamer.cryptocompare.com/v2?api_key=${API_KEY}`
);
const bc = new BroadcastChannel("tickets");
const subPattern = (from, to = "USD") => `5~CCCAGG~${from}~${to}`;

let courseBtcToUsd = 55555;
let isSubscribedBtcToUsd = false;

const sendToWebSocket = message => {
  const stringifyedMessage = JSON.stringify(message);

  if (socket.readyState === WebSocket.OPEN) {
    socket.send(stringifyedMessage);
    return;
  }

  socket.addEventListener(
    "open",
    () => {
      socket.send(stringifyedMessage);
    },
    { once: true }
  );
};

function socketMessageHandler(event) {
  const {
    TYPE: type,
    FROMSYMBOL: currency,
    TOSYMBOL: convertCurrency,
    PRICE: newPrice,
    PARAMETER: parameter,
    MESSAGE: message
  } = JSON.parse(event.data);

  if (type === TOO_MANY_SOCKETS) {
    socket.close();
    return;
  }

  if (socket.readyState !== WebSocket.CLOSED) {
    bc.postMessage(event.data);
  }

  if (type === ERROR && message === "INVALID_SUB") {
    const tickers = Array.from(tickerHandlers.keys());
    const crossTickers = Array.from(crossChangeTickers.keys());
    const currency = tickers.find(ticker => parameter === subPattern(ticker));
    const crossCurrency = crossTickers.find(ticker => {
      return parameter === subPattern(ticker, BTC);
    });
    if (currency && !crossCurrency) {
      crossChangeTickers.set(currency, tickerHandlers.get(currency));
      tickerHandlers.delete(currency);
      subscribeToTickerOnWs(currency, BTC);
      if (!isSubscribedBtcToUsd) {
        subscribeToTickerOnWs(BTC, USD);
        isSubscribedBtcToUsd = true;
      }
      return;
    }
    if (crossCurrency) {
      const handlers = crossChangeTickers.get(crossCurrency) ?? [];
      handlers.forEach(handler => handler.errCb());
      crossChangeTickers.delete(currency);
    }
    const handlers = tickerHandlers.get(currency) ?? [];
    handlers.forEach(handler => handler.errCb());
    tickerHandlers.delete(currency);
    return;
  }

  if (type !== AGGREGATE_INDEX || newPrice === undefined) {
    return;
  }

  if (currency === BTC) {
    courseBtcToUsd = newPrice;
  }

  if (convertCurrency === BTC) {
    if (!courseBtcToUsd) {
      return;
    }
    const handlers = crossChangeTickers.get(currency) ?? [];
    handlers.forEach(handler => handler.cb(newPrice * courseBtcToUsd));
    return;
  }

  const handlers = tickerHandlers.get(currency) ?? [];
  handlers.forEach(handler => handler.cb(newPrice));
}

socket.addEventListener("message", socketMessageHandler);
bc.onmessage = event => {
  console.log(event.data);
  socketMessageHandler(event);
};

const subscribeToTickerOnWs = (from, to) => {
  sendToWebSocket({
    action: "SubAdd",
    subs: [subPattern(from, to)]
  });
};

const unsubscribeFromTickerOnWs = ticker => {
  sendToWebSocket({
    action: "SubRemove",
    subs: [subPattern(ticker)]
  });
};

export const subscribeToTicker = (ticker, cb, errCb) => {
  const subscribers = tickerHandlers.get(ticker) || [];
  tickerHandlers.set(ticker, [...subscribers, { cb, errCb }]);
  subscribeToTickerOnWs(ticker);
};

export const unsubscribeFromTicker = ticker => {
  tickerHandlers.delete(ticker);
  unsubscribeFromTickerOnWs(ticker);
};

window.tickets = tickerHandlers;
