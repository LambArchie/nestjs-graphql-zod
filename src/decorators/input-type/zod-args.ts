import { $ZodObject, $ZodType, output } from 'zod/v4/core'

import { PipeTransform, Type } from '@nestjs/common'
import { Args, ArgsOptions } from '@nestjs/graphql'

import { extractNameAndDescription, getNullability } from '../../helpers'
import { buildEnumType } from '../../helpers/build-enum-type'
import { describeZodSchema } from '../../helpers/describe-zod-schema'
import { getZodDefaultValue } from '../../helpers/generate-defaults'
import { getDescription } from '../../helpers/get-description'
import { getFieldInfoFromZod } from '../../helpers/get-field-info-from-zod'
import { isZodInstance } from '../../helpers/is-zod-instance'
import { ZodValidatorPipe } from '../../helpers/zod-validator.pipe'
import { EnumProvider } from '../../types/enum-provider'
import { TypeProvider } from '../../types/type-provider'
import { getDefaultTypeProvider } from '../common'
import { inputFromZod } from './input-from-zod'
import { buildInputTypeDecorator } from './input-type-with-zod'

type PT<F = any, T = any> = PipeTransform<F, T> | Type<PipeTransform<F, T>>

type CustomDecoratorOptions = {
  /**
   * Gets the scalar type for given type name.
   *
   * @param {string} typeName The type name corresponding to the zod object.
   * @returns {GraphQLScalarType} The scalar type for the zod object.
   */
  getScalarTypeFor?: TypeProvider

  /**
   * Provides a name for nested classes when they are created dynamically from object properties of
   * zod types.
   *
   * @memberof IModelFromZodOptions
   * @param {string} parentName The parent class name.
   * @param {string} propertyKey The property key/name.
   * @returns {string | undefined} The name to set for the class. If any value returned other than a
   *   `string`, the class name will be generated automatically.
   */
  provideNameForNestedClass?: (parentName: string, propertyKey: string) => string | undefined

  /**
   * Gets an enum type for given information.
   *
   * Use this function to prevent creating different enums in GraphQL schema if you are going to use
   * same values in different places.
   *
   * @memberof IModelFromZodOptions
   * @param {string | undefined} name The parent name that contains the enum type.
   * @param {string} key The property name of the enum.
   * @param {Record<string, string | number>} enumObject The enum object that is extracted from the
   *   zod.
   * @returns {Record<string, string | number> | undefined} The enum that will be used instead of
   *   creating a new one. If `undefined` is returned, then a new enum will be created.
   */
  getEnumType?: EnumProvider
}

type DecoratorOptions = ArgsOptions & CustomDecoratorOptions

let GENERATED_TYPES: WeakMap<$ZodType, object> | undefined
let USED_NAMES: string[] | undefined

/**
 * Creates a new type from given zod object or returns previously created one.
 *
 * @template T The type of the zod object passed.
 * @param {T} input The zod scheme object.
 * @param {CustomDecoratorOptions} options The custom decorator options.
 * @returns {any} The newly or previously created class instance.
 */
function _getOrCreateRegisteredType<T extends $ZodObject>(
  input: T,
  options: CustomDecoratorOptions,
) {
  if (!GENERATED_TYPES) {
    GENERATED_TYPES = new WeakMap()
  }
  let RegisteredType = GENERATED_TYPES.get(input) as Type<output<T>> | undefined
  if (RegisteredType) return RegisteredType

  const { name, description } = extractNameAndDescription(input, {})
  const safeName = _getSafeName(name)
  RegisteredType = inputFromZod(input, {
    name: safeName,
    description,
    zod: {
      name: safeName,
      description,
      getEnumType: options.getEnumType,
      getScalarTypeFor: options.getScalarTypeFor,
      provideNameForNestedClass: options.provideNameForNestedClass,
    },
  })

  GENERATED_TYPES.set(input, RegisteredType)
  return RegisteredType
}

/**
 * Checks if the name is used before, in that case, adds a suffix of `_{number}` indicating the
 * number of times the name is used.
 *
 * @param {string} name The name to check.
 * @returns {string} The name that is not used in any other types before.
 */
function _getSafeName(name: string): string {
  if (!USED_NAMES) {
    USED_NAMES = []
  }

  let total = 0
  for (let i = 0, limit = USED_NAMES.length; i < limit; ++i) {
    const current = USED_NAMES[i]
    if (current.startsWith(name)) {
      ++total
    }
  }

  if (total) {
    const newName = `${name}_${total + 1}`
    USED_NAMES.push(newName)
    return newName
  }

  USED_NAMES.push(name)
  return name
}

/**
 * A parameter decorator that takes a `zod` validation input and marks it as GraphQL `Args` with
 * `property` name with given `options` and pipes.
 *
 * @template T The type of the `zod` validation input.
 * @param {T} input The `zod` validation schema object.
 * @param {string} property The name of the property for the GraphQL request argument.
 * @param {DecoratorOptions} options The options for {@link Args} decorator.
 * @param {...PT[]} pipes The pipes that will be passed to {@link Args} decorator.
 * @returns {ParameterDecorator} A {@link ParameterDecorator} for GraphQL
 * argument.
 * @export
 */
export function ZodArgs<T extends $ZodType>(
  input: T,
  property: string,
  options: DecoratorOptions,
  ...pipes: PT[]
): ParameterDecorator

/**
 * A parameter decorator that takes a `zod` validation input and marks it as GraphQL `Args` with
 * `property` name with given `options` and pipes.
 *
 * @template T The type of the `zod` validation input.
 * @param {T} input The `zod` validation schema object.
 * @param {DecoratorOptions} options The options for {@link Args} decorator.
 * @param {...PT[]} pipes The pipes that will be passed to {@link Args} decorator.
 * @returns {ParameterDecorator} A {@link ParameterDecorator} for GraphQL
 * argument.
 * @export
 */
export function ZodArgs<T extends $ZodType>(
  input: T,
  options: DecoratorOptions,
  ...pipes: PT[]
): ParameterDecorator

/**
 * A parameter decorator that takes a `zod` validation input and marks it as GraphQL `Args` with
 * `property` name with given `options` and pipes.
 *
 * @template T The type of the `zod` validation input.
 * @param {T} input The `zod` validation schema object.
 * @param {string} property The name of the property for the GraphQL request argument.
 * @param {...PT[]} pipes The pipes that will be passed to {@link Args} decorator.
 * @returns {ParameterDecorator} A {@link ParameterDecorator} for GraphQL
 * argument.
 * @export
 */
export function ZodArgs<T extends $ZodType>(
  input: T,
  property: string,
  ...pipes: PT[]
): ParameterDecorator

/**
 * A parameter decorator that takes a `zod` validation input and marks it as GraphQL `Args` with
 * `property` name with given `options` and pipes.
 *
 * @template T The type of the `zod` validation input.
 * @param {T} input The `zod` validation schema object.
 * @param {...PT[]} pipes The pipes that will be passed to {@link Args} decorator.
 * @returns {ParameterDecorator} A {@link ParameterDecorator} for GraphQL
 * argument.
 * @export
 */
export function ZodArgs<T extends $ZodType>(input: T, ...pipes: PT[]): ParameterDecorator

export function ZodArgs<T extends $ZodType>(
  input: T,
  propertyOrOptions?: string | DecoratorOptions | PT,
  optionsOrPipe?: DecoratorOptions | PT,
  ...pipes: PT[]
): ParameterDecorator {
  let property: string | undefined
  let options: DecoratorOptions | undefined

  // Parameter normalization
  if (typeof propertyOrOptions === 'string') {
    property = propertyOrOptions
    if (typeof optionsOrPipe === 'object') {
      if ('transform' in optionsOrPipe) {
        pipes.unshift(optionsOrPipe)
      } else {
        options = optionsOrPipe
      }
    }
  } else if (typeof propertyOrOptions === 'object') {
    if (typeof optionsOrPipe === 'object') {
      if ('transform' in optionsOrPipe) {
        pipes.unshift(optionsOrPipe)
      } else {
        options = optionsOrPipe
      }
    } else if ('transform' in propertyOrOptions) {
      pipes.unshift(propertyOrOptions)
    } else {
      options = propertyOrOptions
    }
  }

  options ??= {}
  const { getScalarTypeFor = getDefaultTypeProvider() } = options

  try {
    if (!isZodInstance($ZodObject, input)) {
      pipes.unshift(new ZodValidatorPipe(input))
      const typeInfo = getFieldInfoFromZod(
        '',
        input,
        {
          ...options,
          getDecorator(zodInput: any) {
            const { name } = extractNameAndDescription(zodInput, {})
            return buildInputTypeDecorator(name, { description: getDescription(zodInput) })
          },
        },
        'input',
      )

      // For object schemas, enum registration happens inside parseSingleShape.
      // Non-object schemas bypass that path, so we must register enums here.
      if (typeInfo.isEnum) {
        const enumParentName = property ?? options.name ?? ''
        buildEnumType(enumParentName, typeInfo, {
          name: enumParentName,
          getEnumType: options.getEnumType,
        })
      }

      const nullability = getNullability(typeInfo)
      const description = getDescription(input)

      const { type } = typeInfo
      options.type = () => type
      options.nullable = nullability
      options.description ??= description

      const defaultValue = getZodDefaultValue(input)
      if (defaultValue !== undefined) {
        options.defaultValue ??= defaultValue
      }
    } else {
      const RegisteredType = _getOrCreateRegisteredType(input, {
        getScalarTypeFor,
      })

      pipes.unshift(new ZodValidatorPipe(input, RegisteredType))
      options.type ??= () => RegisteredType
    }
  } catch (err) {
    const propertySuffix = property ? ` for property '${property}'` : ''
    throw new Error(`ZodArgs failed${propertySuffix}${describeZodSchema(input, options.name)}`, {
      cause: err,
    })
  }

  if (options.name) {
    return prepareDecorator(property, options, ...pipes)
  } else {
    return function _anonymousZodArgsWrapper(target, propKey, index) {
      options ??= {}
      options.name = `arg_${index}`
      const decorator = prepareDecorator(property, options, ...pipes)
      decorator(target, propKey, index)
    }
  }
}

/**
 * Gets a prepared {@link ParameterDecorator} after {@link Args} is called.
 *
 * @param {string} [property] The property string.
 * @param {DecoratorOptions} [options] The decorator options.
 * @param {...PT[]} pipes The pipes to apply.
 * @returns {ParameterDecorator} The built parameter decorator.
 */
function prepareDecorator(
  property?: string,
  options?: DecoratorOptions,
  ...pipes: PT[]
): ParameterDecorator {
  let args: ParameterDecorator
  if (typeof property === 'string') {
    if (typeof options === 'object') {
      args = Args(property, options, ...pipes)
    } else {
      args = Args(property, ...pipes)
    }
  } else if (typeof options === 'object') {
    args = Args(options, ...pipes)
  } else {
    args = Args(...pipes)
  }

  return args
}

export namespace ZodArgs {
  /** A type for inferring the type of a given `zod` validation object. */
  export type Of<T extends $ZodType> = output<T>

  /**
   * Frees the used objects during the startup.
   *
   * The {@link ZodArgs} decorator uses helper local variables to keep the naming system working when
   * the same scheme is used multiple times in separate decorators and same name for different
   * schemes.
   *
   * This function should be called after the GraphQL scheme is created.
   *
   * @export
   */
  export function free() {
    USED_NAMES = undefined
    GENERATED_TYPES = undefined
  }
}
