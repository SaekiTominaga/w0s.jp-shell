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
export type NoName1 = number;
export type NoName2 = string;
export type NoName3 = string;
export type NoName4 = string;
export type NoName5 = number;
export type NoName6 = number;
export type APIKey = string;
export type APIKeySecret = string;
export type AccessToken = string;
export type AccessTokenSecret = string;

export interface Twitter {
  title: NoName;
  followers_threshold: NoName1;
  image_dir: NoName2;
  screenshot: Twitter1;
  twitter: TwitterAPI;
}
export interface Twitter1 {
  dir: NoName3;
  extension: NoName4;
  width: NoName5;
  height: NoName6;
}
export interface TwitterAPI {
  dev: NoName7;
  production: NoName8;
}
export interface NoName7 {
  consumer_key: APIKey;
  consumer_secret: APIKeySecret;
  access_token: AccessToken;
  access_token_secret: AccessTokenSecret;
}
export interface NoName8 {
  consumer_key: APIKey;
  consumer_secret: APIKeySecret;
  access_token: AccessToken;
  access_token_secret: AccessTokenSecret;
}
