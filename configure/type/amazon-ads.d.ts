/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * 自然言語による、人間が見て分かりやすい名前を設定する。通知メールの件名などで使用される。
 */
export type NoName = string;
export type JSONURL = string;
export type NoName2 = string;
export type NoName3 = string;
export type BlogASIN = number;
export type NoName4 = string;
/**
 * https://affiliate.amazon.co.jp/assoc_credentials/home
 */
export type NoName5 = string;
/**
 * https://affiliate.amazon.co.jp/assoc_credentials/home
 */
export type NoName6 = string;
/**
 * https://webservices.amazon.com/paapi5/documentation/locale-reference.html
 */
export type TargetAmazonLocale = string;
/**
 * https://webservices.amazon.com/paapi5/documentation/common-request-parameters.html#host-and-region
 */
export type TheHostValueOfTheTargetLocaleToWhichYouAreSendingRequests = string;
/**
 * https://webservices.amazon.com/paapi5/documentation/common-request-parameters.html#host-and-region
 */
export type TheAWSRegionOfTheTargetLocaleToWhichYouAreSendingRequests = string;
export type API = number;
/**
 * https://webservices.amazon.com/paapi5/documentation/get-items.html#ItemLookup-rp
 */
export type GetItemsASIN = number;

export interface Amazon {
  title: NoName;
  ads_put: JSON;
  blog_select_limit: BlogASIN;
  paapi: AmazonProductAdvertisingAPI;
}
export interface JSON {
  url_base: JSONURL;
  auth: NoName1;
  [k: string]: unknown;
}
export interface NoName1 {
  username: NoName2;
  password: NoName3;
}
export interface AmazonProductAdvertisingAPI {
  request: CommonRequestParameters;
  access_interval: API;
  getitems_itemids_chunk: GetItemsASIN;
}
/**
 * https://webservices.amazon.com/paapi5/documentation/common-request-parameters.html
 */
export interface CommonRequestParameters {
  partner_tag: NoName4;
  access_key: NoName5;
  secret_key: NoName6;
  marketplace: TargetAmazonLocale;
  host: TheHostValueOfTheTargetLocaleToWhichYouAreSendingRequests;
  region: TheAWSRegionOfTheTargetLocaleToWhichYouAreSendingRequests;
}
