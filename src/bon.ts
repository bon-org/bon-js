import * as util from "util";
import {
    Atom,
    Binary,
    binary_to_list,
    EmptyList,
    equal,
    float,
    int,
    IOList,
    iolist_to_binary,
    list,
    List,
    list_to_array,
    list_to_atom, list_to_set,
    list_to_string,
    list_to_tuple,
    lists,
    map, set,
    string_to_binary,
    to_binary,
    Tuple,
    tuple_to_list,
    type_of,
} from "./erlang-datatype";
import {$0, $a, $b, $colon, $double_quote, $quote, $space, assert, char_code, test_out} from "./utils";

/*******
 * API *
 *******/

export function encode(Data): IOList {
    return serialize(Data);
}

export function decode(IOList_Bin: IOList | List | Binary) {
    const Type = type_of(IOList_Bin);
    switch (Type) {
        case "iolist": {
            return decode(iolist_to_binary(IOList_Bin as IOList));
        }
        case "list":
            return decode(list_to_string(IOList_Bin as List));
        case "binary":
            const List = binary_to_list(IOList_Bin as Binary);
            const [Rest, Res] = parse(List, EmptyList);
            if (Rest != EmptyList) {
                throw new TypeError("stream is not fully consumed: " + util.inspect({List, Rest, Res}));
            }
            return Res;
        default:
            throw new TypeError("invalid type: " + Type);
    }
}

export function decode_all(Data: IOList | Binary | List, Acc: List) {
    if (!((typeof Data === "string" || Data instanceof Binary || Data instanceof List) && (Acc instanceof List))) {
        throw new Error("bad_arg");
    }
    if (typeof Data === "string") {
        return decode_all(iolist_to_binary(Data), Acc);
    }
    if (Data instanceof Binary) {
        return decode_all(binary_to_list(Data), Acc);
    }
    const Case = parse(Data, EmptyList);
    if (Case.length === 2 && Case[0] === EmptyList) {
        const Res = Case[1];
        return lists.reverse(Acc.append(Res));
    }
    if (Case.length === 2) {
        const [Next_List, Res] = Case;
        return decode_all(Next_List, Acc.append(Res));
    }
    throw new TypeError("Failed to assign left hand side from right hand side: " + util.inspect(Case));
}

/********
 * Test *
 ********/

export function data_test(Data?) {
    if (Data) {
        const encoded = encode(Data);
        const binary = iolist_to_binary(encoded).value;
        const Res = decode(encoded);
        if (!equal(Data, Res)) {
            throw new Error("not_match: " + util.inspect({
                Data: {
                    type: type_of(Data),
                    value: Data,
                },
                encoded: binary,
                binary: binary.toString(),
                Res: {
                    type: type_of(Res),
                    value: Res,
                },
            }));
        }
        return "ok";
    }
    const res = [
        42,
        -72,
        1.5,
        3.14,
        Atom("atom"),
        "AB",
        [65, 0, 66],
        string_to_binary("text"),
        new Tuple(Atom("record"), Atom("content")),
        [new Tuple(Atom("debug"), Atom("true")), Atom("safe"), Atom("speedup"), new Tuple(Atom("log"), "file.log")],
        {user: "admin", pw: "123"},
        {log: [{time: 123}, {time: 234}]},
        new Set([1, 2, 3]),
        new Map([["user", "admin"], ["pw", "123"]]),
    ].map(data => {
        const res = data_test(data);
        if (res == "ok") {
            test_out("passed " + util.inspect(data));
        }
        return res;
    }).every(res => res == "ok");
    return res === true ? "ok" : res;
}

/************
 * Internal *
 ************/

const WORD_TUPLE = "t";
const WORD_LIST = "l";
const WORD_MAP = "m";
const WORD_SET = "s";

/* serializer  */
export function serialize(Data): IOList {
    const type = type_of(Data);
    switch (type) {
        case "int":
            return " " + Data + " ";
        case "float": {
            const [A, B] = fac(Data);
            return B == 1
                ? " " + A + " "
                : " " + A + "/" + B + " ";
        }
        case "symbol": {
            const Bin = Symbol.keyFor(Data);
            const Bin_Size = Bin.length;
            return `'a:${Bin_Size}:${Bin}'`;
        }
        case "iolist":
        case "string": {
            // const Str = (Data as string).split('"').join('\\"');
            // return IOList.from($double_quote, string_to_binary(Str), $double_quote);
            return JSON.stringify(Data);
        }
        case "array": {
            const Children = serialize_array(Data);
            return `[${Children} ${WORD_LIST} `;
        }
        case "list": {
            const Children = serialize_list(Data);
            return `[${Children} ${WORD_LIST} `;
        }
        case "set": {
            const Children = serialize_set(Data);
            return `[${Children} ${WORD_SET} `;
        }
        case "binary": {
            const Bin = to_binary(Data).toString();
            const Bin_Size = Bin.length;
            return `'b:${Bin_Size}:${Bin}'`;
        }
        case "tuple": {
            const Tuple = Data as Tuple;
            const List_ = tuple_to_list(Tuple);
            const Children = serialize_list(List_);
            return `[${Children} ${WORD_TUPLE} `;
        }
        case "map": {
            let Children: IOList = "";
            (Data as map).forEach((V, K) => {
                const K_Bin = serialize(K);
                const V_Bin = serialize(V);
                // Children = IOList.from(Children, K_Bin, V_Bin);
                // Children.append(K_Bin);
                // Children.append(V_Bin);
                Children = V_Bin + K_Bin + Children;
            });
            return `[${Children} ${WORD_MAP} `;
        }
        case "object": {
            const Children: IOList = Object.keys(Data)
                .reduce((Acc, K) => {
                    const V = Data[K];
                    const K_Bin = serialize(K);
                    const V_Bin = serialize(V);
                    // return IOList.from(Acc, K_Bin, V_Bin);
                    // Acc.append(K_Bin);
                    // Acc.append(V_Bin);
                    Acc = V_Bin + K_Bin + Acc;
                    return Acc;
                }, "");
            return `[${Children} ${WORD_MAP} `;
        }
        default:
            throw new TypeError("unknown type: " + type + ", data=" + util.inspect(Data));
    }
}

function serialize_array(Array: any[]): IOList {
    return Array.reduce((Acc: IOList, X): IOList => {
        return serialize(X) + Acc;
    }, "");
}

export function serialize_list(List: List): IOList {
    return lists.foldl((X, Acc): IOList => {
        return serialize(X) + Acc;
    }, "", List);
}

export function serialize_set(Set: set): IOList {
    let Acc = "";
    Set.forEach(X => Acc = serialize(X) + Acc);
    return Acc;
}

/* parser */

interface Word {
    name: string
}

function parse(List: List, Acc: List): [List, any] {

    /* finish */
    if (List == EmptyList) {
        assert(Acc.tail == EmptyList, "invalid list");
        return [List, Acc.value];
    }

    const H = List.value;
    const T0 = List.tail;

    /* skip space */
    if (H == $space) {
        return parse(T0, Acc);
    }

    /* number */
    if (is_digit(H)) {
        const [num, tail] = parse_number(T0, H - 48, 1);
        return parse(tail, Acc.append(num));
    }
    if (H == char_code["-"] && T0 != EmptyList && is_digit(T0.value)) {
        const [num, tail] = parse_number(T0.tail, T0.value - 48, 1);
        return parse(tail, Acc.append(-num));
    }

    /* atom */
    {
        const [is_match, T1] = parse_head(list($quote, $a, $colon), List);
        if (is_match && is_digit(T1.value)) {
            const [Size, T2] = parse_number(T1.tail, T1.value - 48, 2);
            assert(T2.value == $colon, "invalid atom expr (1)");
            const [List, T3] = lists.split(Size, T2.tail);
            assert(T3.value == $quote, "invalid atom expr (2)");
            const Atom = list_to_atom(List);
            return parse(T3.tail, Acc.append(Atom));
        }
    }

    /* binary */
    {
        const match = () => {
            const H1 = H;
            if (H1 != $quote) {
                return [false];
            }
            const H2 = T0.value;
            if (H2 != $b) {
                return [false];
            }
            const H3 = T0.tail.value;
            if (H3 != $colon) {
                return [false];
            }
            const H4 = T0.tail.tail.value;
            if (!is_digit(H4)) {
                return [false];
            }
            const T0_ = T0.tail.tail.tail;
            return [true, H4, T0_];
        };
        const [is_match, H_, T0_] = match();
        if (is_match) {
            const [Size, List1] = parse_number(T0_, H_ - $0, 2);
            assert(List1.value == $colon, "Binary data should come with a colon after size");
            const T1 = List1.tail;
            const [List_, List2] = lists.split(Size, T1);
            assert(List2.value == $quote, "Binary data should end with a single quote");
            const T2 = List2.tail;
            const Bin = iolist_to_binary(List_);
            return parse(T2, Acc.append(Bin));
        }
    }

    /* group: tuple, list and map/set/object */
    if (H === char_code["["]) {
        const [Word, T1, Children] = parse(T0, EmptyList) as any as [any, any, any];
        const Res = (() => {
            switch (Word.name) {
                case WORD_TUPLE:
                    return list_to_tuple(Children);
                case WORD_LIST:
                    return list_to_array(Children);
                case WORD_SET:
                    return list_to_set(Children);
                case WORD_MAP:
                    return list_to_map(Children, new Map());
                default:
                    throw new TypeError("unexpected word: " + util.inspect(Word));
            }
        })();
        return parse(T1, Acc.append(Res));
    }

    if (is_alphabet(H)) {
        const [Name, T1] = parse_word(T0, EmptyList.append(H));
        const Word: Word = {name: Name};
        return [Word, T1, Acc] as any;
    }

    /* string */
    if (H === $double_quote) {
        const [Str, T1] = parse_string(T0, "");
        return parse(T1, Acc.append(Str));
    }

    /* not impl */
    // List = list_to_string(List) as any;
    throw new Error("bad_arg: " + util.inspect({List, Acc}));
}

function parse_head(Token: List, List: List): [boolean, List] {
    if (Token == EmptyList) {
        return [true, List];
    }
    return Token.value == List.value
        ? parse_head(Token.tail, List.tail)
        : [false, List];
}

function parse_number(list: List, acc: number, count: number): [number, List] {
    if (list != EmptyList) {
        if (is_digit(list.value)) {
            return parse_number(list.tail, acc * 10 + (list.value - 48), count);
        }
        if (list.value == char_code["/"] && is_digit(list.tail.value) && count == 1) {
            const [q, tail] = parse_number(list.tail.tail, list.tail.value - 48, 2);
            return [acc / q, tail];
        }
    }
    return [acc, list];
}

/**
 * input without starting double quote
 * output without ending double quote
 *
 * e.g. 'text"rest' ~~> ["text","rest"]
 * */
function parse_string(list: List, acc: string): [string, List] {
    return list.value === $double_quote
        ? [acc, list.tail]
        : parse_string(list.tail, acc + String.fromCodePoint(list.value));
}

function parse_word(List_: List, Acc) {
    if (is_word_body(List_.value)) {
        return parse_word(List_.tail, Acc.append(List_.value));
    }
    assert(List_ instanceof List, "bad_arg first argument should be List");
    const Name = list_to_string(lists.reverse(Acc));
    return [Name, List_];
}

function fac(F: float) {
    if (F == 1) {
        return [1, 1];
    }
    if (F < 1) {
        const [A, B] = fac(1 / F);
        return fac2(B, A);
    }
    const [A, B] = fac_power_up(F, 1);
    return fac2(A, B);
}

export function fac_test(F) {
    const [A, B] = fac(F);
    const Diff = Math.abs(F - A / B);
    return Diff / F;
}

function fac2(A: int, B: int) {
    const D = gcd(A, B);
    return [round(A / D), round(B / D)];
}

const round = Math.round.bind(Math);

function fac_power_up(F: float, Acc: int) {
    return Math.round(F) == F ? [Math.round(F), Acc] : fac_power_up(F * 10, Acc * 10);
}

function gcd(A: int, B: int): int {
    return A == 0 ? B
        : B == 0 ? A
            : gcd(B, A % B);
}

function list_to_map(List: List, Acc: map) {
    if (List === EmptyList) {
        return Acc;
    }
    const K = List.value;
    const V = List.tail.value;
    const T = List.tail.tail;
    Acc.set(K, V);
    return list_to_map(T, Acc);
}

const is_digit = (c) => 48 <= c && c <= (48 + 9);
const is_small_cap = (c) => char_code["a"] <= c && c <= char_code["z"];
const is_large_cap = (c) => char_code["A"] <= c && c <= char_code["Z"];
const is_alphabet = (c) => is_small_cap(c) || is_large_cap(c);
const is_word_body = (c) => is_digit(c) || is_alphabet(c);
