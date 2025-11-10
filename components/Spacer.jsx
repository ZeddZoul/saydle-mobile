import { View } from 'react-native'
import React from 'react'

const Spacer = ({height, flex, ...props}) => {
  return (
    <View style={[{ height: 20 }, {height }, {flex}]} {...props} />
  )
}

export default Spacer
